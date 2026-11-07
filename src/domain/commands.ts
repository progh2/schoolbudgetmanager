// 사업·배정·항목·집행 쓰기의 유일한 입구.
// 각 명령은 순수 함수다: (현재 데이터, 입력, ctx) → 쓰기 목록 또는 실패. 저장은 스토어가 transact로 한다.
// 검증·감사 기록이 여기 한 곳에 있어서 화면이 새로 생겨도 규칙을 우회할 수 없다.
import type {
  Allocation, BudgetItem, Data, Department, EvidenceType, Execution, FiscalYear, Project, Write,
} from "../schema/entities";
import { buildIndex, projectOfItem, type Index } from "./balance";
import { auditWrite, fail, live, type Ctx, type Result } from "./ctx";
import { formatWon } from "./money";
import { actionNeedsReason, nextProjectStatus, PROJECT_STATUS_LABEL, type ProjectAction } from "./project";

const isInt = (n: number) => Number.isInteger(n);
const find = <T extends { id: string }>(rows: T[], id: string) => rows.find((r) => r.id === id) ?? null;

function created<T>(ctx: Ctx, fields: T) {
  return { id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null, ...fields };
}

// ── 회계연도·부서 ─────────────────────────────────────

export function createFiscalYear(data: Data, input: { label: string; start: string; end: string }, ctx: Ctx): Result {
  if (!input.label.trim()) return fail("invalid", "회계연도 이름을 적어 주세요.");
  if (input.start >= input.end) return fail("invalid", "시작일이 종료일보다 앞이어야 해요.");
  if (live(data.fiscalYears).some((f) => f.label === input.label.trim()))
    return fail("duplicate", `${input.label} 회계연도가 이미 있어요.`);
  const value: FiscalYear = created(ctx, { label: input.label.trim(), start: input.start, end: input.end });
  return { ok: true, id: value.id, writes: [{ table: "fiscalYears", value }, auditWrite(ctx, "fiscalYear", value.id, "create", null, value)] };
}

/** 학교 회계연도 기본값: 3월 1일 ~ 이듬해 2월 말일 */
export function defaultFiscalYear(year: number) {
  const leap = (year + 1) % 4 === 0 && ((year + 1) % 100 !== 0 || (year + 1) % 400 === 0);
  return { label: String(year), start: `${year}-03-01`, end: `${year + 1}-02-${leap ? 29 : 28}` };
}

export function saveDepartment(data: Data, input: { id?: string; name: string; active?: boolean }, ctx: Ctx): Result {
  const name = input.name.trim();
  if (!name) return fail("invalid", "부서 이름을 적어 주세요.");
  const others = live(data.departments).filter((d) => d.id !== input.id);
  if (others.some((d) => d.name === name)) return fail("duplicate", `'${name}' 부서가 이미 있어요.`);
  if (input.id) {
    const before = find(data.departments, input.id);
    if (!before) return fail("not_found", "부서를 찾지 못했어요.");
    const value: Department = { ...before, name, active: input.active ?? before.active, updatedAt: ctx.now };
    return { ok: true, id: value.id, writes: [{ table: "departments", value }, auditWrite(ctx, "department", value.id, "update", before, value)] };
  }
  const order = Math.max(-1, ...data.departments.map((d) => d.order)) + 1;
  const value: Department = created(ctx, { name, order, active: input.active ?? true });
  return { ok: true, id: value.id, writes: [{ table: "departments", value }, auditWrite(ctx, "department", value.id, "create", null, value)] };
}

// ── 목적사업 ──────────────────────────────────────────

export interface ProjectInput {
  id?: string;
  fiscalYearId: string;
  name: string;
  ownerDepartmentId: string | null;
  total: number;
  memo: string;
}

export function saveProject(data: Data, input: ProjectInput, ctx: Ctx): Result {
  const name = input.name.trim();
  if (!name) return fail("invalid", "사업 이름을 적어 주세요.");
  if (!isInt(input.total) || input.total < 0) return fail("invalid", "총액은 0 이상의 원 단위 정수여야 해요.");
  if (!find(data.fiscalYears, input.fiscalYearId)) return fail("invalid", "회계연도를 골라 주세요.");
  const dup = live(data.projects).find((p) => p.id !== input.id && p.fiscalYearId === input.fiscalYearId && p.name === name);
  if (dup) return fail("duplicate", `같은 회계연도에 '${name}' 사업이 이미 있어요.`);

  if (!input.id) {
    const value: Project = created(ctx, {
      fiscalYearId: input.fiscalYearId, name, ownerDepartmentId: input.ownerDepartmentId,
      total: input.total, status: "planning" as const, regulationFileIds: [], memo: input.memo,
    });
    return { ok: true, id: value.id, writes: [{ table: "projects", value }, auditWrite(ctx, "project", value.id, "create", null, value)] };
  }

  const before = find(data.projects, input.id);
  if (!before || before.deletedAt) return fail("not_found", "사업을 찾지 못했어요.");
  if (before.status === "closed") return fail("locked", "마감한 사업이에요. 고치려면 먼저 다시 열어 주세요.");
  if (before.status === "operating" && before.total !== input.total)
    return fail("locked", "운영 중인 사업의 총액은 변경안(계획 변경·추경)으로만 바꿀 수 있어요.");
  const allocated = live(data.allocations).filter((a) => a.projectId === before.id).reduce((s, a) => s + a.amount, 0);
  if (input.total < allocated)
    return fail("over_total", `이미 ${formatWon(allocated)}을 배정했어요. 총액을 그보다 줄일 수 없어요.`);
  const value: Project = {
    ...before, name, ownerDepartmentId: input.ownerDepartmentId, total: input.total,
    memo: input.memo, fiscalYearId: input.fiscalYearId, updatedAt: ctx.now,
  };
  return { ok: true, id: value.id, writes: [{ table: "projects", value }, auditWrite(ctx, "project", value.id, "update", before, value)] };
}

export function changeProjectStatus(data: Data, input: { id: string; action: ProjectAction; reason?: string }, ctx: Ctx): Result {
  const before = find(data.projects, input.id);
  if (!before || before.deletedAt) return fail("not_found", "사업을 찾지 못했어요.");
  const to = nextProjectStatus(before.status, input.action);
  if (!to) return fail("bad_transition", `${PROJECT_STATUS_LABEL[before.status]} 상태에서는 할 수 없는 일이에요.`);
  const reason = input.reason?.trim() ?? "";
  if (actionNeedsReason(input.action) && !reason) return fail("reason_required", "다시 여는 이유를 적어 주세요.");
  const value: Project = { ...before, status: to, updatedAt: ctx.now };
  return {
    ok: true, id: value.id,
    writes: [{ table: "projects", value }, auditWrite(ctx, "project", value.id, `status:${input.action}`, { status: before.status }, { status: to }, reason)],
  };
}

export function setRegulationFiles(data: Data, input: { projectId: string; fileIds: string[] }, ctx: Ctx): Result {
  const before = find(data.projects, input.projectId);
  if (!before) return fail("not_found", "사업을 찾지 못했어요.");
  const value: Project = { ...before, regulationFileIds: input.fileIds, updatedAt: ctx.now };
  return { ok: true, writes: [{ table: "projects", value }, auditWrite(ctx, "project", value.id, "regulations", before.regulationFileIds, input.fileIds)] };
}

// ── 배정 ──────────────────────────────────────────────

export interface AllocationInput {
  id?: string;
  projectId: string;
  departmentId: string;
  amount: number;
  basis: number | null;
  memo: string;
}

function editableProject(data: Data, projectId: string, amountChange: boolean) {
  const p = find(data.projects, projectId);
  if (!p || p.deletedAt) return fail("not_found", "사업을 찾지 못했어요.");
  if (p.status === "closed") return fail("locked", "마감한 사업이에요. 고치려면 먼저 다시 열어 주세요.");
  if (p.status === "operating" && amountChange)
    return fail("locked", "운영 중인 사업의 금액은 변경안(계획 변경·추경)으로만 바꿀 수 있어요.");
  return p;
}

export function saveAllocation(data: Data, input: AllocationInput, ctx: Ctx): Result {
  if (!isInt(input.amount) || input.amount < 0) return fail("invalid", "배정액은 0 이상의 원 단위 정수여야 해요.");
  if (input.basis !== null && !(input.basis > 0)) return fail("invalid", "기준값은 0보다 커야 해요. 없으면 비워 두세요.");
  const before = input.id ? find(data.allocations, input.id) : null;
  if (input.id && !before) return fail("not_found", "배정을 찾지 못했어요.");
  const p = editableProject(data, input.projectId, !before || before.amount !== input.amount);
  if ("ok" in p) return p;
  if (!find(data.departments, input.departmentId)) return fail("invalid", "부서를 골라 주세요.");

  const siblings = live(data.allocations).filter((a) => a.projectId === p.id && a.id !== input.id);
  if (siblings.some((a) => a.departmentId === input.departmentId))
    return fail("duplicate", "이 사업에 같은 부서 배정이 이미 있어요. 그 배정의 금액을 고쳐 주세요.");
  const sum = siblings.reduce((s, a) => s + a.amount, 0) + input.amount;
  if (sum > p.total)
    return fail("over_total", `배정 합계 ${formatWon(sum)}가 사업 총액 ${formatWon(p.total)}을 ${formatWon(sum - p.total)} 넘어요.`);
  if (before) {
    const limits = live(data.items).filter((i) => i.allocationId === before.id).reduce((s, i) => s + i.limit, 0);
    if (input.amount < limits)
      return fail("under_items", `항목 한도 합계가 ${formatWon(limits)}예요. 배정액을 그보다 줄일 수 없어요.`);
  }

  const value: Allocation = before
    ? { ...before, departmentId: input.departmentId, amount: input.amount, basis: input.basis, memo: input.memo, updatedAt: ctx.now }
    : created(ctx, { projectId: p.id, departmentId: input.departmentId, amount: input.amount, basis: input.basis, memo: input.memo });
  return {
    ok: true, id: value.id,
    writes: [{ table: "allocations", value }, auditWrite(ctx, "allocation", value.id, before ? "update" : "create", before, value)],
  };
}

function hasExecutions(idx: Index, itemIds: string[]) {
  return itemIds.some((id) => (idx.executionsByItem.get(id)?.length ?? 0) > 0);
}

export function deleteAllocation(data: Data, input: { id: string; reason: string }, ctx: Ctx): Result {
  const before = find(data.allocations, input.id);
  if (!before || before.deletedAt) return fail("not_found", "배정을 찾지 못했어요.");
  const p = editableProject(data, before.projectId, true);
  if ("ok" in p) return p;
  const idx = buildIndex(data);
  const items = idx.itemsByAllocation.get(before.id) ?? [];
  if (hasExecutions(idx, items.map((i) => i.id))) return fail("in_use", "집행 내역이 있는 배정은 지울 수 없어요.");
  const writes: Write[] = [{ table: "allocations", value: { ...before, deletedAt: ctx.now, updatedAt: ctx.now } }];
  for (const it of items) writes.push({ table: "items", value: { ...it, deletedAt: ctx.now, updatedAt: ctx.now } });
  writes.push(auditWrite(ctx, "allocation", before.id, "delete", before, null, input.reason));
  return { ok: true, writes };
}

// ── 예산 항목 ─────────────────────────────────────────

export interface ItemInput {
  id?: string;
  allocationId: string;
  code: string;
  name: string;
  limit: number;
  dueDate: string | null;
  requiredEvidence: EvidenceType[];
}

export function saveItem(data: Data, input: ItemInput, ctx: Ctx): Result {
  const name = input.name.trim();
  if (!name) return fail("invalid", "항목 이름을 적어 주세요.");
  if (!isInt(input.limit) || input.limit < 0) return fail("invalid", "한도는 0 이상의 원 단위 정수여야 해요.");
  const a = find(data.allocations, input.allocationId);
  if (!a || a.deletedAt) return fail("not_found", "배정을 찾지 못했어요.");
  const before = input.id ? find(data.items, input.id) : null;
  if (input.id && !before) return fail("not_found", "항목을 찾지 못했어요.");
  // 운영 중에도 한도 0원짜리 새 항목은 만들 수 있다(금액은 변경안으로 붙인다)
  const amountChange = before ? before.limit !== input.limit : input.limit !== 0;
  const p = editableProject(data, a.projectId, amountChange);
  if ("ok" in p) return p;
  const sum = live(data.items).filter((i) => i.allocationId === a.id && i.id !== input.id).reduce((s, i) => s + i.limit, 0) + input.limit;
  if (sum > a.amount)
    return fail("over_allocation", `항목 한도 합계 ${formatWon(sum)}가 배정액 ${formatWon(a.amount)}을 ${formatWon(sum - a.amount)} 넘어요.`);
  const fields = { code: input.code.trim(), name, limit: input.limit, dueDate: input.dueDate || null, requiredEvidence: input.requiredEvidence };
  const value: BudgetItem = before ? { ...before, ...fields, updatedAt: ctx.now } : created(ctx, { allocationId: a.id, ...fields });
  return { ok: true, id: value.id, writes: [{ table: "items", value }, auditWrite(ctx, "item", value.id, before ? "update" : "create", before, value)] };
}

export function deleteItem(data: Data, input: { id: string; reason: string }, ctx: Ctx): Result {
  const before = find(data.items, input.id);
  if (!before || before.deletedAt) return fail("not_found", "항목을 찾지 못했어요.");
  const a = find(data.allocations, before.allocationId);
  if (!a) return fail("not_found", "배정을 찾지 못했어요.");
  const p = editableProject(data, a.projectId, before.limit !== 0);
  if ("ok" in p) return p;
  if (hasExecutions(buildIndex(data), [before.id])) return fail("in_use", "집행 내역이 있는 항목은 지울 수 없어요.");
  return {
    ok: true,
    writes: [{ table: "items", value: { ...before, deletedAt: ctx.now, updatedAt: ctx.now } }, auditWrite(ctx, "item", before.id, "delete", before, null, input.reason)],
  };
}

// ── 집행 ──────────────────────────────────────────────

export interface ExecutionInput {
  id?: string;
  itemId: string | null;
  date: string;
  amount: number;
  summary: string;
  vendor: string;
  overLimitReason?: string;
}

export function saveExecution(data: Data, input: ExecutionInput, ctx: Ctx): Result {
  if (!isInt(input.amount) || input.amount === 0) return fail("invalid", "금액은 0이 아닌 원 단위 정수여야 해요(반납은 음수).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return fail("invalid", "집행일을 골라 주세요.");
  const before = input.id ? find(data.executions, input.id) : null;
  if (input.id && (!before || before.deletedAt)) return fail("not_found", "집행을 찾지 못했어요.");
  if (before?.source === "upload" && (before.amount !== input.amount || before.date !== input.date))
    return fail("locked", "에듀파인에서 올린 집행의 금액·날짜는 고칠 수 없어요. 에듀파인에서 고친 뒤 다시 올려 주세요.");

  const idx = buildIndex(data);
  let reason: string | null = null;
  if (input.itemId) {
    const item = idx.items.get(input.itemId);
    if (!item) return fail("not_found", "항목을 찾지 못했어요.");
    const p = projectOfItem(idx, item.id);
    if (p?.status === "closed") return fail("locked", "마감한 사업이에요. 고치려면 먼저 다시 열어 주세요.");
    const spentOthers = (idx.spentByItem.get(item.id) ?? 0) - (before && before.itemId === item.id ? before.amount : 0);
    const after = spentOthers + input.amount;
    if (after > item.limit) {
      reason = input.overLimitReason?.trim() || before?.overLimitReason || null;
      if (!reason)
        return fail("over_limit", `'${item.name}' 한도 ${formatWon(item.limit)}를 ${formatWon(after - item.limit)} 넘어요. 넘기는 이유를 적으면 반영돼요.`);
    }
  }
  const fields = {
    itemId: input.itemId, date: input.date, amount: input.amount, summary: input.summary.trim(),
    vendor: input.vendor.trim(), overLimitReason: reason,
  };
  const value: Execution = before
    ? { ...before, ...fields, updatedAt: ctx.now }
    : created(ctx, { ...fields, source: "manual" as const, batchId: null, dedupeKey: null });
  return {
    ok: true, id: value.id,
    writes: [
      { table: "executions", value },
      auditWrite(ctx, "execution", value.id, before ? "update" : "create", before, value, reason ?? ""),
    ],
  };
}

export function deleteExecution(data: Data, input: { id: string; reason: string }, ctx: Ctx): Result {
  const before = find(data.executions, input.id);
  if (!before || before.deletedAt) return fail("not_found", "집행을 찾지 못했어요.");
  const p = before.itemId ? projectOfItem(buildIndex(data), before.itemId) : null;
  if (p?.status === "closed") return fail("locked", "마감한 사업이에요. 고치려면 먼저 다시 열어 주세요.");
  return {
    ok: true,
    writes: [
      { table: "executions", value: { ...before, deletedAt: ctx.now, updatedAt: ctx.now } },
      auditWrite(ctx, "execution", before.id, "delete", before, null, input.reason),
    ],
  };
}

export function restoreExecution(data: Data, input: { id: string }, ctx: Ctx): Result {
  const before = find(data.executions, input.id);
  if (!before || !before.deletedAt) return fail("not_found", "되돌릴 집행이 없어요.");
  if (before.batchId && find(data.uploadBatches, before.batchId)?.revertedAt)
    return fail("locked", "되돌린 업로드에 속한 집행이에요. 파일을 다시 올려 주세요.");
  return {
    ok: true,
    writes: [
      { table: "executions", value: { ...before, deletedAt: null, updatedAt: ctx.now } },
      auditWrite(ctx, "execution", before.id, "restore", null, before),
    ],
  };
}

/** 미분류(짝 없는) 집행을 항목에 잇는다. 업로드 행도 항목 연결만은 고칠 수 있다 */
export function assignExecutionItem(data: Data, input: { id: string; itemId: string | null }, ctx: Ctx): Result {
  const before = find(data.executions, input.id);
  if (!before || before.deletedAt) return fail("not_found", "집행을 찾지 못했어요.");
  const idx = buildIndex(data);
  if (input.itemId && !idx.items.has(input.itemId)) return fail("not_found", "항목을 찾지 못했어요.");
  for (const id of [before.itemId, input.itemId])
    if (id && projectOfItem(idx, id)?.status === "closed") return fail("locked", "마감한 사업의 집행은 옮길 수 없어요.");
  const value: Execution = { ...before, itemId: input.itemId, updatedAt: ctx.now };
  return { ok: true, writes: [{ table: "executions", value }, auditWrite(ctx, "execution", before.id, "assign", before, value)] };
}

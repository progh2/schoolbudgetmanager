// 계획 변경·추경 (ARCHITECTURE §5). 운영 중 사업의 금액은 여기서만 바뀐다.
//   draft ─submit→ in_review ─confirm, 승인 기록→ confirmed
//     │               ├─reject, 사유→ rejected ─cancel→ cancelled
//     │               └─withdraw→ draft
//     └─cancel→ cancelled
// confirmed는 되돌리지 않는다(반대 방향 변경안이 출구). rejected·cancelled는 "복사해서 다시 작성"이 출구.
import type { Data, Revision, RevisionChange, Write } from "../schema/entities";
import { buildIndex } from "./balance";
import { auditWrite, fail, live, type Ctx, type Result } from "./ctx";
import { formatWon } from "./money";

export type RevisionAction = "submit" | "withdraw" | "confirm" | "reject" | "cancel";

const TABLE: Record<Revision["status"], Partial<Record<RevisionAction, Revision["status"]>>> = {
  draft: { submit: "in_review", cancel: "cancelled" },
  in_review: { confirm: "confirmed", reject: "rejected", withdraw: "draft" },
  rejected: { cancel: "cancelled" },
  confirmed: {},
  cancelled: {},
};

export const REVISION_STATUS_LABEL: Record<Revision["status"], string> = {
  draft: "작성 중", in_review: "검토 중", confirmed: "확정", rejected: "반려", cancelled: "취소",
};
export const REVISION_ACTION_LABEL: Record<RevisionAction, string> = {
  submit: "제출", withdraw: "작성 중으로 되돌리기", confirm: "확정", reject: "반려", cancel: "취소",
};
export const REVISION_KIND_LABEL = { plan_change: "계획 변경", supplementary: "추경" } as const;

export function nextRevisionStatus(from: Revision["status"], action: RevisionAction) {
  return TABLE[from][action] ?? null;
}
export const allowedRevisionActions = (from: Revision["status"]) => Object.keys(TABLE[from]) as RevisionAction[];
export const canCopy = (s: Revision["status"]) => s === "rejected" || s === "cancelled";

/** 변경 대상의 지금 금액 */
export function currentAmount(data: Data, target: RevisionChange["target"], id: string): number | null {
  if (target === "project") return data.projects.find((p) => p.id === id && !p.deletedAt)?.total ?? null;
  if (target === "allocation") return data.allocations.find((a) => a.id === id && !a.deletedAt)?.amount ?? null;
  return data.items.find((i) => i.id === id && !i.deletedAt)?.limit ?? null;
}

/** 변경을 적용했을 때 지켜야 할 것들. 빈 배열이면 확정할 수 있다 */
export function validateRevision(data: Data, rev: Pick<Revision, "projectId" | "kind" | "changes">): string[] {
  const problems: string[] = [];
  const project = data.projects.find((p) => p.id === rev.projectId && !p.deletedAt);
  if (!project) return ["사업을 찾지 못했어요."];
  if (project.status !== "operating") problems.push("운영 중인 사업만 변경안을 확정할 수 있어요.");
  const real = rev.changes.filter((c) => c.after !== c.before);
  if (real.length === 0) problems.push("바뀌는 금액이 없어요.");
  for (const c of rev.changes) if (!Number.isInteger(c.after) || c.after < 0) problems.push("금액은 0 이상의 원 단위 정수여야 해요.");

  const totalChange = real.find((c) => c.target === "project");
  if (rev.kind === "plan_change" && totalChange) problems.push("계획 변경은 사업 총액을 바꿀 수 없어요. 총액이 바뀌면 추경으로 만들어 주세요.");
  if (rev.kind === "supplementary" && !totalChange) problems.push("추경은 사업 총액이 바뀌어야 해요. 총액이 그대로면 계획 변경으로 만들어 주세요.");

  // 바뀐 뒤의 숫자로 다시 맞춰 본다
  const after = new Map(rev.changes.map((c) => [`${c.target}:${c.targetId}`, c.after]));
  const val = (t: RevisionChange["target"], id: string, now: number) => after.get(`${t}:${id}`) ?? now;
  const idx = buildIndex(data);
  const total = val("project", project.id, project.total);
  const allocs = idx.allocationsByProject.get(project.id) ?? [];
  const allocSum = allocs.reduce((s, a) => s + val("allocation", a.id, a.amount), 0);
  if (allocSum > total) problems.push(`배정 합계 ${formatWon(allocSum)}가 총액 ${formatWon(total)}을 넘어요.`);
  for (const a of allocs) {
    const amount = val("allocation", a.id, a.amount);
    const items = idx.itemsByAllocation.get(a.id) ?? [];
    const limits = items.reduce((s, i) => s + val("item", i.id, i.limit), 0);
    const dept = data.departments.find((d) => d.id === a.departmentId)?.name ?? "부서";
    if (limits > amount) problems.push(`${dept}: 항목 한도 합계 ${formatWon(limits)}가 배정액 ${formatWon(amount)}을 넘어요.`);
    for (const it of items) {
      const spent = idx.spentByItem.get(it.id) ?? 0;
      const limit = val("item", it.id, it.limit);
      if (limit < spent) problems.push(`${dept} · ${it.name}: 이미 ${formatWon(spent)}을 썼어요. 한도를 ${formatWon(limit)}로 줄이면 잔액이 ${formatWon(limit - spent)}가 돼요.`);
    }
  }
  return problems;
}

function nextSeq(data: Data, projectId: string, kind: Revision["kind"]) {
  return data.revisions.filter((r) => r.projectId === projectId && r.kind === kind && r.status === "confirmed").length + 1;
}

export function createRevision(data: Data, input: { projectId: string; kind: Revision["kind"]; reason: string }, ctx: Ctx): Result {
  const p = data.projects.find((x) => x.id === input.projectId && !x.deletedAt);
  if (!p) return fail("not_found", "사업을 찾지 못했어요.");
  if (p.status !== "operating") return fail("locked", "운영 중인 사업에만 변경안을 만들 수 있어요. 계획 단계에서는 금액을 바로 고치세요.");
  const value: Revision = {
    id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
    projectId: p.id, kind: input.kind, seq: nextSeq(data, p.id, input.kind), status: "draft", changes: [],
    reason: input.reason.trim(), approval: null, rejectReason: "", copiedFrom: null, confirmedAt: null,
  };
  return { ok: true, id: value.id, writes: [{ table: "revisions", value }, auditWrite(ctx, "revision", value.id, "create", null, value)] };
}

/** 작성 중일 때만 고친다. before는 지금 금액으로 찍어 두고, 확정할 때 그사이 바뀌었는지 본다 */
export function editRevision(
  data: Data,
  input: { id: string; reason: string; changes: { target: RevisionChange["target"]; targetId: string; after: number }[] },
  ctx: Ctx,
): Result {
  const before = data.revisions.find((r) => r.id === input.id);
  if (!before) return fail("not_found", "변경안을 찾지 못했어요.");
  if (before.status !== "draft") return fail("locked", "작성 중인 변경안만 고칠 수 있어요.");
  const changes: RevisionChange[] = [];
  for (const c of input.changes) {
    const now = currentAmount(data, c.target, c.targetId);
    if (now === null) return fail("not_found", "변경 대상을 찾지 못했어요.");
    if (!Number.isInteger(c.after) || c.after < 0) return fail("invalid", "금액은 0 이상의 원 단위 정수여야 해요.");
    if (c.after !== now) changes.push({ target: c.target, targetId: c.targetId, before: now, after: c.after });
  }
  const value: Revision = { ...before, changes, reason: input.reason.trim(), updatedAt: ctx.now };
  return { ok: true, writes: [{ table: "revisions", value }] };
}

export function transitionRevision(
  data: Data,
  input: { id: string; action: RevisionAction; reason?: string; approval?: { approver: string; date: string; note: string } },
  ctx: Ctx,
): Result {
  const rev = data.revisions.find((r) => r.id === input.id);
  if (!rev) return fail("not_found", "변경안을 찾지 못했어요.");
  const to = nextRevisionStatus(rev.status, input.action);
  if (!to) return fail("bad_transition", `${REVISION_STATUS_LABEL[rev.status]} 상태에서는 ${REVISION_ACTION_LABEL[input.action]}할 수 없어요.`);
  const reason = input.reason?.trim() ?? "";
  const writes: Write[] = [];
  let value: Revision = { ...rev, status: to, updatedAt: ctx.now };

  if (input.action === "submit" || input.action === "confirm") {
    if (!rev.reason) return fail("reason_required", "변경 사유를 적어 주세요.");
    const problems = validateRevision(data, rev);
    if (problems.length) return fail("invalid", problems.join(" "));
  }
  if (input.action === "reject") {
    if (!reason) return fail("reason_required", "반려 사유를 적어 주세요.");
    value.rejectReason = reason;
  }
  if (input.action === "confirm") {
    const a = input.approval;
    if (!a?.approver.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return fail("approval_required", "승인자와 승인일을 적어 주세요.");
    // 작성한 뒤에 다른 변경안이 같은 금액을 바꿨으면 이 변경안의 '전' 숫자가 틀린다
    for (const c of rev.changes)
      if (currentAmount(data, c.target, c.targetId) !== c.before)
        return fail("stale", "작성한 뒤에 금액이 바뀌었어요. 작성 중으로 되돌려 다시 저장해 주세요.");
    value = { ...value, approval: { approver: a.approver.trim(), date: a.date, note: a.note.trim() }, confirmedAt: ctx.now, seq: nextSeq(data, rev.projectId, rev.kind) };
    for (const c of rev.changes) {
      if (c.target === "project") {
        const p = data.projects.find((x) => x.id === c.targetId)!;
        writes.push({ table: "projects", value: { ...p, total: c.after, updatedAt: ctx.now } });
      } else if (c.target === "allocation") {
        const x = data.allocations.find((y) => y.id === c.targetId)!;
        writes.push({ table: "allocations", value: { ...x, amount: c.after, updatedAt: ctx.now } });
      } else {
        const x = data.items.find((y) => y.id === c.targetId)!;
        writes.push({ table: "items", value: { ...x, limit: c.after, updatedAt: ctx.now } });
      }
    }
  }
  writes.unshift({ table: "revisions", value });
  writes.push(auditWrite(ctx, "revision", rev.id, `revision:${input.action}`, { status: rev.status }, { status: to }, reason || input.approval?.note || ""));
  return { ok: true, writes };
}

/** 반려·취소된 변경안을 새 작성 중 변경안으로 복사한다. '전' 금액은 지금 값으로 다시 찍는다 */
export function copyRevision(data: Data, input: { id: string }, ctx: Ctx): Result {
  const src = data.revisions.find((r) => r.id === input.id);
  if (!src) return fail("not_found", "변경안을 찾지 못했어요.");
  if (!canCopy(src.status)) return fail("bad_transition", "반려·취소된 변경안만 복사할 수 있어요.");
  const created = createRevision(data, { projectId: src.projectId, kind: src.kind, reason: src.reason }, ctx);
  if (!created.ok) return created;
  const draft = created.writes[0].value as Revision;
  const changes: RevisionChange[] = [];
  for (const c of src.changes) {
    const now = currentAmount(data, c.target, c.targetId);
    if (now !== null && now !== c.after) changes.push({ ...c, before: now });
  }
  const value: Revision = { ...draft, changes, copiedFrom: src.id };
  return { ok: true, id: value.id, writes: [{ table: "revisions", value }, auditWrite(ctx, "revision", value.id, "create", null, { copiedFrom: src.id })] };
}

/**
 * 시점 조회 (#19): 그 변경안이 확정되기 직전의 금액. 저장하지 않고 지금 값에서 확정 변경안을 거꾸로 되감아 계산한다.
 * 운영 중 금액은 변경안으로만 바뀌므로 되감기가 정확하다.
 */
export function amountsBefore(data: Data, revisionId: string): Map<string, number> {
  const rev = data.revisions.find((r) => r.id === revisionId);
  const out = new Map<string, number>();
  if (!rev?.confirmedAt) return out;
  const p = data.projects.find((x) => x.id === rev.projectId);
  if (!p) return out;
  out.set(`project:${p.id}`, p.total);
  for (const a of live(data.allocations).filter((a) => a.projectId === p.id)) {
    out.set(`allocation:${a.id}`, a.amount);
    for (const i of live(data.items).filter((i) => i.allocationId === a.id)) out.set(`item:${i.id}`, i.limit);
  }
  const later = data.revisions
    .filter((r) => r.projectId === p.id && r.status === "confirmed" && r.confirmedAt! >= rev.confirmedAt!)
    .sort((x, y) => y.confirmedAt!.localeCompare(x.confirmedAt!));
  for (const r of later) for (const c of r.changes) out.set(`${c.target}:${c.targetId}`, c.before);
  return out;
}

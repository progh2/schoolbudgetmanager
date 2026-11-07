// 증빙 판정 (M3). 필수 유형 대비 붙은 것으로 없음·일부·완비를 가른다.
// "라벨이 있으면 완비"로 세면 부풀려진다 — 필수 유형별로 실제 파일이 있는지 본다.
import type { BudgetItem, Data, Evidence, EvidenceType } from "../schema/entities";
import { auditWrite, fail, live, type Ctx, type Result } from "./ctx";

export const evidenceTypeLabel: Record<EvidenceType, string> = {
  official: "공문",
  proposal: "품의서",
  resolution: "지출결의서",
  receipt: "영수증·세금계산서",
  etc: "기타",
};

export type EvidenceState = "none" | "partial" | "complete" | "not_required";

export const evidenceStateLabel: Record<EvidenceState, string> = {
  none: "없음",
  partial: "일부",
  complete: "완비",
  not_required: "필수 없음",
};

export interface EvidenceJudgement {
  state: EvidenceState;
  missing: EvidenceType[];
  /** 보완 필요로 표시된 증빙이 있는지 */
  needsFix: boolean;
  count: number;
}

/** item이 없으면(미분류 집행) 필수 유형을 알 수 없어 not_required로 본다 */
export function judgeEvidence(item: BudgetItem | null, evidences: Evidence[]): EvidenceJudgement {
  const liveEv = evidences.filter((e) => !e.deletedAt);
  const required = [...new Set(item?.requiredEvidence ?? [])];
  // 보완 필요로 반려된 증빙은 갖춘 것으로 치지 않는다. 같은 유형의 새 파일이 붙으면 보완된 것으로 본다
  const have = new Set(liveEv.filter((e) => e.review !== "needs_fix").map((e) => e.type));
  const needsFix = liveEv.some((e) => e.review === "needs_fix" && !have.has(e.type));
  const missing = required.filter((t) => !have.has(t));
  let state: EvidenceState;
  if (required.length === 0) state = "not_required";
  else if (missing.length === 0) state = "complete";
  else if (missing.length === required.length) state = "none";
  else state = "partial";
  return { state, missing, needsFix, count: liveEv.length };
}

/** 큰 파일 경고 기준. 막지는 않는다(공문 스캔본은 클 수 있다) */
export const LARGE_FILE = 50 * 1024 * 1024;

export function addEvidence(
  data: Data,
  input: { executionId: string; type: EvidenceType; fileId: string; fileName: string },
  ctx: Ctx,
): Result {
  const ex = data.executions.find((e) => e.id === input.executionId && !e.deletedAt);
  if (!ex) return fail("not_found", "집행을 찾지 못했어요.");
  const value: Evidence = {
    id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
    executionId: ex.id, type: input.type, fileId: input.fileId, fileName: input.fileName, review: "pending", reviewNote: "",
  };
  return { ok: true, id: value.id, writes: [{ table: "evidences", value }, auditWrite(ctx, "evidence", value.id, "create", null, value)] };
}

export function reviewEvidence(data: Data, input: { id: string; review: Evidence["review"]; note: string }, ctx: Ctx): Result {
  const before = data.evidences.find((e) => e.id === input.id && !e.deletedAt);
  if (!before) return fail("not_found", "증빙을 찾지 못했어요.");
  if (input.review === "needs_fix" && !input.note.trim()) return fail("reason_required", "무엇을 보완해야 하는지 적어 주세요.");
  const value: Evidence = { ...before, review: input.review, reviewNote: input.note.trim(), updatedAt: ctx.now };
  return { ok: true, writes: [{ table: "evidences", value }, auditWrite(ctx, "evidence", value.id, "review", { review: before.review }, { review: value.review }, value.reviewNote)] };
}

export function changeEvidenceType(data: Data, input: { id: string; type: EvidenceType }, ctx: Ctx): Result {
  const before = data.evidences.find((e) => e.id === input.id && !e.deletedAt);
  if (!before) return fail("not_found", "증빙을 찾지 못했어요.");
  const value: Evidence = { ...before, type: input.type, updatedAt: ctx.now };
  return { ok: true, writes: [{ table: "evidences", value }, auditWrite(ctx, "evidence", value.id, "update", before, value)] };
}

/** 증빙은 지운 표시만 한다. 파일은 남겨 두어 되돌릴 수 있다 */
export function deleteEvidence(data: Data, input: { id: string; reason: string }, ctx: Ctx): Result {
  const before = data.evidences.find((e) => e.id === input.id && !e.deletedAt);
  if (!before) return fail("not_found", "증빙을 찾지 못했어요.");
  if (!input.reason.trim()) return fail("reason_required", "지우는 이유를 적어 주세요.");
  return {
    ok: true,
    writes: [
      { table: "evidences", value: { ...before, deletedAt: ctx.now, updatedAt: ctx.now } },
      auditWrite(ctx, "evidence", before.id, "delete", before, null, input.reason.trim()),
    ],
  };
}

export function restoreEvidence(data: Data, input: { id: string }, ctx: Ctx): Result {
  const before = data.evidences.find((e) => e.id === input.id && e.deletedAt);
  if (!before) return fail("not_found", "되돌릴 증빙이 없어요.");
  return { ok: true, writes: [{ table: "evidences", value: { ...before, deletedAt: null, updatedAt: ctx.now } }, auditWrite(ctx, "evidence", before.id, "restore", null, before)] };
}

export interface ChecklistRow {
  executionId: string;
  itemId: string | null;
  judgement: EvidenceJudgement;
}

/** 증빙 준비 목록: 회계연도 안의 살아 있는 집행마다 판정. 대시보드 숫자도 이걸 쓴다 */
export function evidenceChecklist(data: Data, range: { start: string; end: string }): ChecklistRow[] {
  const items = new Map(live(data.items).map((i) => [i.id, i]));
  const byExec = new Map<string, Evidence[]>();
  for (const e of data.evidences) {
    const arr = byExec.get(e.executionId);
    if (arr) arr.push(e); else byExec.set(e.executionId, [e]);
  }
  return live(data.executions)
    .filter((e) => e.date >= range.start && e.date <= range.end)
    .map((e) => ({ executionId: e.id, itemId: e.itemId, judgement: judgeEvidence(e.itemId ? items.get(e.itemId) ?? null : null, byExec.get(e.id) ?? []) }));
}

export const isEvidenceLacking = (j: EvidenceJudgement) => j.state === "none" || j.state === "partial" || j.needsFix;

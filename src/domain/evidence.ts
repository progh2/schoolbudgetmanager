// 증빙 판정 (M3). 필수 유형 대비 붙은 것으로 없음·일부·완비를 가른다.
// "라벨이 있으면 완비"로 세면 부풀려진다 — 필수 유형별로 실제 파일이 있는지 본다.
import type { BudgetItem, Evidence, EvidenceType } from "../schema/entities";

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
  const needsFix = liveEv.some((e) => e.review === "needs_fix");
  const required = [...new Set(item?.requiredEvidence ?? [])];
  // 보완 필요로 반려된 증빙은 갖춘 것으로 치지 않는다
  const have = new Set(liveEv.filter((e) => e.review !== "needs_fix").map((e) => e.type));
  const missing = required.filter((t) => !have.has(t));
  let state: EvidenceState;
  if (required.length === 0) state = "not_required";
  else if (missing.length === 0) state = "complete";
  else if (missing.length === required.length) state = "none";
  else state = "partial";
  return { state, missing, needsFix, count: liveEv.length };
}

import { describe, expect, it } from "vitest";
import { applyWrites } from "./apply";
import { addEvidence, deleteEvidence, evidenceChecklist, isEvidenceLacking, judgeEvidence, restoreEvidence, reviewEvidence } from "./evidence";
import { buildFixtureWorld } from "./fixtures";

function setup() {
  const f = buildFixtureWorld();
  const exec = f.w.data.executions.find((e) => e.itemId === f.ids.i1)!; // 강사수당: 필수 품의서·지출결의서
  return { ...f, exec };
}
const item = (f: ReturnType<typeof setup>) => f.w.data.items.find((i) => i.id === f.ids.i1)!;
const evs = (f: ReturnType<typeof setup>) => f.w.data.evidences.filter((e) => e.executionId === f.exec.id);

describe("증빙 판정", () => {
  it("필수 0개면 '필수 없음', 붙인 수에 따라 없음 → 일부 → 완비", () => {
    const f = setup();
    expect(judgeEvidence(null, []).state).toBe("not_required");
    expect(judgeEvidence(item(f), []).state).toBe("none");
    f.w.run(addEvidence, { executionId: f.exec.id, type: "proposal", fileId: "f1", fileName: "품의.pdf" });
    expect(judgeEvidence(item(f), evs(f))).toMatchObject({ state: "partial", missing: ["resolution"] });
    f.w.run(addEvidence, { executionId: f.exec.id, type: "proposal", fileId: "f2", fileName: "품의2.pdf" });
    expect(judgeEvidence(item(f), evs(f)).state).toBe("partial"); // 같은 유형 두 개는 하나로 센다
    f.w.run(addEvidence, { executionId: f.exec.id, type: "resolution", fileId: "f3", fileName: "결의.pdf" });
    expect(judgeEvidence(item(f), evs(f)).state).toBe("complete");
  });

  it("보완 필요는 막다른 상태가 아니다: 같은 유형을 새로 붙이면 다시 갖춘 것으로 본다", () => {
    const f = setup();
    f.w.run(addEvidence, { executionId: f.exec.id, type: "proposal", fileId: "f1", fileName: "품의.pdf" });
    const resId = f.w.run(addEvidence, { executionId: f.exec.id, type: "resolution", fileId: "f2", fileName: "결의.pdf" });
    expect(f.w.try(reviewEvidence, { id: resId, review: "needs_fix", note: "" }).ok).toBe(false); // 사유 필수
    f.w.run(reviewEvidence, { id: resId, review: "needs_fix", note: "도장 누락" });
    expect(judgeEvidence(item(f), evs(f))).toMatchObject({ state: "partial", needsFix: true });
    f.w.run(addEvidence, { executionId: f.exec.id, type: "resolution", fileId: "f3", fileName: "결의-보완.pdf" });
    expect(judgeEvidence(item(f), evs(f))).toMatchObject({ state: "complete", needsFix: false });
  });

  it("지운 증빙은 세지 않고 되돌리면 다시 센다", () => {
    const f = setup();
    const id = f.w.run(addEvidence, { executionId: f.exec.id, type: "proposal", fileId: "f1", fileName: "품의.pdf" });
    f.w.run(deleteEvidence, { id, reason: "잘못 붙임" });
    expect(judgeEvidence(item(f), evs(f)).state).toBe("none");
    f.w.run(restoreEvidence, { id });
    expect(judgeEvidence(item(f), evs(f)).state).toBe("partial");
  });

  it("준비 목록의 '미비' 건수는 판정과 같다", () => {
    const f = setup();
    const fy = f.w.data.fiscalYears[0];
    const list = evidenceChecklist(f.w.data, fy);
    expect(list).toHaveLength(2);
    expect(list.filter((r) => isEvidenceLacking(r.judgement))).toHaveLength(2);
    const r = addEvidence(f.w.data, { executionId: f.exec.id, type: "proposal", fileId: "x", fileName: "x" }, f.w.ctx);
    if (!r.ok) throw new Error();
    expect(evidenceChecklist(applyWrites(f.w.data, r.writes), fy).filter((x) => isEvidenceLacking(x.judgement))).toHaveLength(2); // 일부도 미비
  });
});

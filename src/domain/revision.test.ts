import { describe, expect, it } from "vitest";
import { buildIndex, itemSummary } from "./balance";
import { saveAllocation, saveExecution } from "./commands";
import { buildFixtureWorld } from "./fixtures";
import {
  allowedRevisionActions, amountsBefore, copyRevision, createRevision, editRevision, nextRevisionStatus, transitionRevision,
} from "./revision";
import { REVISION_STATUS } from "../schema/entities";

// 픽스처(운영 중): 총액 10,000,000 / 교무부 6,000,000(강사수당 5,000,000, 집행 1,200,000) / 정보부 3,000,000(교재 2,000,000, 집행 345,000)
const approval = { approver: "교장 김○○", date: "2026-06-01", note: "운영위 심의" };

function setup() {
  const f = buildFixtureWorld();
  const id = (kind: "plan_change" | "supplementary", reason = "사유") => f.w.run(createRevision, { projectId: f.ids.p, kind, reason });
  const val = () => ({
    total: f.w.data.projects[0].total,
    a1: f.w.data.allocations.find((a) => a.id === f.ids.a1)!.amount,
    a2: f.w.data.allocations.find((a) => a.id === f.ids.a2)!.amount,
    i1: f.w.data.items.find((i) => i.id === f.ids.i1)!.limit,
  });
  return { ...f, id, val };
}

describe("변경안 상태기계", () => {
  it("모든 상태 × 모든 행동: 표에 있는 것만 허용", () => {
    const allowed: Record<string, string[]> = {
      draft: ["submit", "cancel"], in_review: ["confirm", "reject", "withdraw"], rejected: ["cancel"], confirmed: [], cancelled: [],
    };
    for (const s of REVISION_STATUS) {
      expect(allowedRevisionActions(s).sort()).toEqual(allowed[s].sort());
      for (const a of ["submit", "withdraw", "confirm", "reject", "cancel"] as const)
        expect(nextRevisionStatus(s, a) !== null, `${s}/${a}`).toBe(allowed[s].includes(a));
    }
  });

  it("계획 변경: 부서 사이 금액 이동 → 제출 → 확정(승인 기록) → 금액 반영", () => {
    const f = setup();
    const r = f.id("plan_change", "정보부 교재 수요 증가");
    f.w.run(editRevision, { id: r, reason: "정보부 교재 수요 증가", changes: [
      { target: "allocation", targetId: f.ids.a1, after: 5_500_000 },
      { target: "allocation", targetId: f.ids.a2, after: 3_500_000 },
      { target: "item", targetId: f.ids.i2, after: 2_500_000 },
    ] });
    f.w.run(transitionRevision, { id: r, action: "submit" });
    expect(f.w.try(transitionRevision, { id: r, action: "confirm" }).ok).toBe(false); // 승인 기록 없음
    f.w.run(transitionRevision, { id: r, action: "confirm", approval });
    expect(f.val()).toMatchObject({ total: 10_000_000, a1: 5_500_000, a2: 3_500_000 });
    const rev = f.w.data.revisions.find((x) => x.id === r)!;
    expect(rev).toMatchObject({ status: "confirmed", seq: 1, approval: { approver: "교장 김○○" } });
    expect(f.w.data.audit.at(-1)).toMatchObject({ action: "revision:confirm", reason: "운영위 심의" });
  });

  it("계획 변경은 총액을 바꿀 수 없고, 추경은 총액이 바뀌어야 한다", () => {
    const f = setup();
    const r = f.id("plan_change");
    f.w.run(editRevision, { id: r, reason: "x", changes: [{ target: "project", targetId: f.ids.p, after: 12_000_000 }] });
    const res = f.w.try(transitionRevision, { id: r, action: "submit" });
    expect(res.ok === false && res.message).toContain("추경으로");
    const s = f.id("supplementary");
    f.w.run(editRevision, { id: s, reason: "x", changes: [{ target: "allocation", targetId: f.ids.a1, after: 6_500_000 }] });
    const res2 = f.w.try(transitionRevision, { id: s, action: "submit" });
    expect(res2.ok === false && res2.message).toContain("계획 변경으로");
  });

  it("감액으로 잔액이 음수가 되는 항목은 확정 전에 막고 무엇이 문제인지 말한다", () => {
    const f = setup();
    const s = f.id("supplementary", "교육청 감액");
    f.w.run(editRevision, { id: s, reason: "교육청 감액", changes: [
      { target: "project", targetId: f.ids.p, after: 7_000_000 },
      { target: "allocation", targetId: f.ids.a1, after: 4_000_000 },
      { target: "item", targetId: f.ids.i1, after: 1_000_000 },
    ] });
    const res = f.w.try(transitionRevision, { id: s, action: "submit" });
    expect(res.ok === false && res.message).toContain("이미 1,200,000원을 썼어요");
  });

  it("반려는 사유가 필요하고, 반려된 것은 복사해서 다시 작성할 수 있다", () => {
    const f = setup();
    const r = f.id("plan_change", "이동");
    f.w.run(editRevision, { id: r, reason: "이동", changes: [{ target: "allocation", targetId: f.ids.a2, after: 4_000_000 }] });
    f.w.run(transitionRevision, { id: r, action: "submit" });
    expect(f.w.try(transitionRevision, { id: r, action: "reject" }).ok).toBe(false);
    f.w.run(transitionRevision, { id: r, action: "reject", reason: "근거 부족" });
    expect(f.w.try(editRevision, { id: r, reason: "x", changes: [] }).ok).toBe(false); // 반려된 것은 고치지 못한다
    const copy = f.w.run(copyRevision, { id: r });
    const c = f.w.data.revisions.find((x) => x.id === copy)!;
    expect(c).toMatchObject({ status: "draft", copiedFrom: r, changes: [{ targetId: f.ids.a2, before: 3_000_000, after: 4_000_000 }] });
    expect(f.val().a2).toBe(3_000_000); // 반려는 운영 숫자에 영향 없음
  });

  it("작성 뒤 다른 변경안이 같은 금액을 바꿨으면 확정을 막는다", () => {
    const f = setup();
    const a = f.id("plan_change", "a");
    const b = f.id("plan_change", "b");
    for (const [id, after] of [[a, 3_500_000], [b, 3_800_000]] as const) {
      f.w.run(editRevision, { id, reason: "r", changes: [{ target: "allocation", targetId: f.ids.a2, after }] });
      f.w.run(transitionRevision, { id, action: "submit" });
    }
    f.w.run(transitionRevision, { id: a, action: "confirm", approval });
    const res = f.w.try(transitionRevision, { id: b, action: "confirm", approval });
    expect(res.ok === false && res.code).toBe("stale");
  });

  it("운영 중 금액은 변경안 없이 못 바꾸고, 확정은 n차로 센다", () => {
    const f = setup();
    expect(f.w.try(saveAllocation, { id: f.ids.a1, projectId: f.ids.p, departmentId: f.ids.d1, amount: 1, basis: null, memo: "" }).ok).toBe(false);
    for (const total of [11_000_000, 12_000_000]) {
      const s = f.id("supplementary", "증액");
      f.w.run(editRevision, { id: s, reason: "증액", changes: [{ target: "project", targetId: f.ids.p, after: total }] });
      f.w.run(transitionRevision, { id: s, action: "submit" });
      f.w.run(transitionRevision, { id: s, action: "confirm", approval });
    }
    expect(f.w.data.revisions.filter((r) => r.kind === "supplementary").map((r) => r.seq)).toEqual([1, 2]);
  });
});

describe("시점 조회", () => {
  it("1·2·3차 추경 각 확정 직전 숫자가 손 계산과 같다", () => {
    const f = setup();
    const steps: [string, number, number][] = [ // [시각, 총액, 교무부 배정]
      ["2026-06-01T00:00:00.000Z", 11_000_000, 7_000_000],
      ["2026-09-01T00:00:00.000Z", 12_000_000, 8_000_000],
      ["2026-12-01T00:00:00.000Z", 9_500_000, 6_500_000],
    ];
    const ids: string[] = [];
    for (const [now, total, a1] of steps) {
      f.w.ctx.now = now;
      const s = f.id("supplementary", "추경");
      f.w.run(editRevision, { id: s, reason: "추경", changes: [
        { target: "project", targetId: f.ids.p, after: total },
        { target: "allocation", targetId: f.ids.a1, after: a1 },
      ] });
      f.w.run(transitionRevision, { id: s, action: "submit" });
      f.w.run(transitionRevision, { id: s, action: "confirm", approval });
      ids.push(s);
    }
    const at = (i: number) => amountsBefore(f.w.data, ids[i]);
    expect(at(0).get(`project:${f.ids.p}`)).toBe(10_000_000);
    expect(at(0).get(`allocation:${f.ids.a1}`)).toBe(6_000_000);
    expect(at(1).get(`project:${f.ids.p}`)).toBe(11_000_000);
    expect(at(2).get(`allocation:${f.ids.a1}`)).toBe(8_000_000);
    expect(at(2).get(`allocation:${f.ids.a2}`)).toBe(3_000_000); // 안 바뀐 것은 그대로
    expect(f.val()).toMatchObject({ total: 9_500_000, a1: 6_500_000 });
  });

  it("추경으로 늘린 한도에서 집행하면 잔액이 맞는다", () => {
    const f = setup();
    const s = f.id("supplementary", "증액");
    f.w.run(editRevision, { id: s, reason: "증액", changes: [
      { target: "project", targetId: f.ids.p, after: 11_000_000 },
      { target: "allocation", targetId: f.ids.a1, after: 7_000_000 },
      { target: "item", targetId: f.ids.i1, after: 6_000_000 },
    ] });
    f.w.run(transitionRevision, { id: s, action: "submit" });
    f.w.run(transitionRevision, { id: s, action: "confirm", approval });
    f.w.run(saveExecution, { itemId: f.ids.i1, date: "2026-07-01", amount: 4_800_000, summary: "", vendor: "" });
    const idx = buildIndex(f.w.data);
    expect(itemSummary(idx, idx.items.get(f.ids.i1)!)).toMatchObject({ spent: 6_000_000, remaining: 0 });
  });
});

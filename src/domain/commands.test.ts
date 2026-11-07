import { describe, expect, it } from "vitest";
import { allocationSummary, buildIndex, departmentRows, itemSummary, projectSummary } from "./balance";
import {
  changeProjectStatus, createFiscalYear, defaultFiscalYear, deleteExecution, restoreExecution,
  saveAllocation, saveDepartment, saveExecution, saveItem, saveProject,
} from "./commands";
import { world } from "./testkit";

function setup() {
  const w = world();
  const fy = w.run(createFiscalYear, defaultFiscalYear(2026));
  const d1 = w.run(saveDepartment, { name: "교무부" });
  const d2 = w.run(saveDepartment, { name: "학생부" });
  const p = w.run(saveProject, { fiscalYearId: fy, name: "방과후학교", ownerDepartmentId: d1, total: 10_000_000, memo: "" });
  return { w, fy, d1, d2, p };
}

describe("회계연도", () => {
  it("학교 회계연도는 3월 1일부터 이듬해 2월 말일까지 (윤년 반영)", () => {
    expect(defaultFiscalYear(2026)).toEqual({ label: "2026", start: "2026-03-01", end: "2027-02-28" });
    expect(defaultFiscalYear(2027).end).toBe("2028-02-29");
  });
});

describe("배정", () => {
  it("배정 합계가 사업 총액을 넘으면 저장하지 않고 넘는 금액을 말한다", () => {
    const { w, p, d1, d2 } = setup();
    w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 7_000_000, basis: null, memo: "" });
    const r = w.try(saveAllocation, { projectId: p, departmentId: d2, amount: 4_000_000, basis: null, memo: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("over_total");
      expect(r.message).toContain("1,000,000원");
    }
  });

  it("같은 사업에 같은 부서를 두 번 배정할 수 없다", () => {
    const { w, p, d1 } = setup();
    w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 1, basis: null, memo: "" });
    expect(w.try(saveAllocation, { projectId: p, departmentId: d1, amount: 1, basis: null, memo: "" }).ok).toBe(false);
  });

  it("항목 한도 합계는 배정액을 넘을 수 없고, 배정액도 한도 합계 아래로 줄일 수 없다", () => {
    const { w, p, d1 } = setup();
    const a = w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 1_000_000, basis: null, memo: "" });
    w.run(saveItem, { allocationId: a, code: "", name: "강사료", limit: 800_000, dueDate: null, requiredEvidence: [] });
    expect(w.try(saveItem, { allocationId: a, code: "", name: "재료비", limit: 300_000, dueDate: null, requiredEvidence: [] }).ok).toBe(false);
    const r = w.try(saveAllocation, { id: a, projectId: p, departmentId: d1, amount: 700_000, basis: null, memo: "" });
    expect(r.ok === false && r.code).toBe("under_items");
  });

  it("총액을 이미 배정한 금액보다 줄일 수 없다", () => {
    const { w, p, d1, fy } = setup();
    w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 6_000_000, basis: null, memo: "" });
    const r = w.try(saveProject, { id: p, fiscalYearId: fy, name: "방과후학교", ownerDepartmentId: d1, total: 5_000_000, memo: "" });
    expect(r.ok === false && r.code).toBe("over_total");
  });
});

describe("사업 상태", () => {
  it("운영 중에는 금액이 잠기고 마감은 다시 열기(사유)로만 빠져나온다", () => {
    const { w, p, d1, fy } = setup();
    const a = w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 1_000_000, basis: null, memo: "" });
    w.run(changeProjectStatus, { id: p, action: "start" });
    expect(w.try(saveAllocation, { id: a, projectId: p, departmentId: d1, amount: 2_000_000, basis: null, memo: "" }).ok).toBe(false);
    expect(w.try(saveProject, { id: p, fiscalYearId: fy, name: "방과후", ownerDepartmentId: d1, total: 9, memo: "" }).ok).toBe(false);
    // 메모만 바꾸는 것은 된다
    w.run(saveAllocation, { id: a, projectId: p, departmentId: d1, amount: 1_000_000, basis: null, memo: "담당 김" });

    w.run(changeProjectStatus, { id: p, action: "close" });
    expect(w.try(saveAllocation, { id: a, projectId: p, departmentId: d1, amount: 1_000_000, basis: null, memo: "x" }).ok).toBe(false);
    expect(w.try(changeProjectStatus, { id: p, action: "reopen" }).ok).toBe(false); // 사유 없음
    w.run(changeProjectStatus, { id: p, action: "reopen", reason: "연말 정산 누락분" });
    expect(w.data.projects[0].status).toBe("operating");
  });

  it("허용되지 않은 전이는 거부한다", () => {
    const { w, p } = setup();
    expect(w.try(changeProjectStatus, { id: p, action: "close" }).ok).toBe(false);
    expect(w.try(changeProjectStatus, { id: p, action: "reopen", reason: "x" }).ok).toBe(false);
  });

  it("모든 쓰기는 감사 기록을 남긴다", () => {
    const { w, p } = setup();
    w.run(changeProjectStatus, { id: p, action: "start" });
    const last = w.data.audit.at(-1)!;
    expect(last).toMatchObject({ entity: "project", entityId: p, action: "status:start", before: { status: "planning" }, after: { status: "operating" } });
  });
});

describe("집행과 잔액", () => {
  function withItem() {
    const s = setup();
    const a = s.w.run(saveAllocation, { projectId: s.p, departmentId: s.d1, amount: 1_000_000, basis: 20, memo: "" });
    const item = s.w.run(saveItem, { allocationId: a, code: "210-01", name: "강사료", limit: 600_000, dueDate: "2027-02-15", requiredEvidence: ["resolution"] });
    return { ...s, a, item };
  }

  it("집행이 없으면 '집행 없음'이고 잔액은 한도와 같다", () => {
    const { w, item } = withItem();
    const s = itemSummary(buildIndex(w.data), w.data.items.find((i) => i.id === item)!);
    expect(s).toMatchObject({ executed: false, spent: 0, remaining: 600_000, rate: 0 });
  });

  it("손으로 계산한 표와 같다", () => {
    const { w, item, a, p, fy, d1, d2 } = withItem();
    w.run(saveExecution, { itemId: item, date: "2026-04-10", amount: 250_000, summary: "4월 강사료", vendor: "" });
    w.run(saveExecution, { itemId: item, date: "2026-05-10", amount: 250_000, summary: "5월 강사료", vendor: "" });
    w.run(saveExecution, { itemId: item, date: "2026-05-20", amount: -20_000, summary: "반납", vendor: "" });
    const idx = buildIndex(w.data);
    // 항목: 한도 600,000 − 집행 480,000 = 120,000, 80%
    expect(itemSummary(idx, idx.items.get(item)!)).toMatchObject({ spent: 480_000, remaining: 120_000, rate: 0.8, executionCount: 3 });
    // 배정: 1,000,000 − 480,000 = 520,000, 48%
    expect(allocationSummary(idx, idx.allocations.get(a)!)).toMatchObject({ spent: 480_000, remaining: 520_000, rate: 0.48, itemLimitSum: 600_000 });
    // 사업: 10,000,000, 배정 1,000,000 → 미배정 9,000,000
    expect(projectSummary(idx, idx.projects.get(p)!)).toMatchObject({ allocated: 1_000_000, unallocated: 9_000_000, spent: 480_000, rate: 0.048 });
    const rows = departmentRows(idx, fy);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ departmentId: d1, allocated: 1_000_000, basis: 20, perBasis: 50_000 });
    expect(rows.find((r) => r.departmentId === d2)).toBeUndefined();
  });

  it("배정 0원이면 집행률은 null(비율을 지어내지 않는다)", () => {
    const { w, p, d2 } = withItem();
    const a2 = w.run(saveAllocation, { projectId: p, departmentId: d2, amount: 0, basis: null, memo: "" });
    const idx = buildIndex(w.data);
    expect(allocationSummary(idx, idx.allocations.get(a2)!).rate).toBeNull();
  });

  it("기준값이 하나라도 빠진 부서는 기준값당 배정액을 내지 않는다", () => {
    const { w, fy, d1 } = withItem();
    const p2 = w.run(saveProject, { fiscalYearId: fy, name: "돌봄", ownerDepartmentId: d1, total: 500, memo: "" });
    w.run(saveAllocation, { projectId: p2, departmentId: d1, amount: 500, basis: null, memo: "" });
    expect(departmentRows(buildIndex(w.data), fy)[0]).toMatchObject({ basis: null, perBasis: null, allocated: 1_000_500 });
  });

  it("한도를 넘는 수동 입력은 사유가 있어야 반영된다", () => {
    const { w, item } = withItem();
    w.run(saveExecution, { itemId: item, date: "2026-04-10", amount: 500_000, summary: "", vendor: "" });
    const r = w.try(saveExecution, { itemId: item, date: "2026-04-11", amount: 200_000, summary: "", vendor: "" });
    expect(r.ok === false && r.code).toBe("over_limit");
    if (!r.ok) expect(r.message).toContain("100,000원");
    const id = w.run(saveExecution, { itemId: item, date: "2026-04-11", amount: 200_000, summary: "", vendor: "", overLimitReason: "강사 추가 배정, 교장 승인" });
    expect(w.data.executions.find((e) => e.id === id)?.overLimitReason).toBe("강사 추가 배정, 교장 승인");
  });

  it("자기 자신을 고칠 때는 이전 금액을 빼고 한도를 본다", () => {
    const { w, item } = withItem();
    const id = w.run(saveExecution, { itemId: item, date: "2026-04-10", amount: 600_000, summary: "", vendor: "" });
    expect(w.try(saveExecution, { id, itemId: item, date: "2026-04-10", amount: 600_000, summary: "고침", vendor: "" }).ok).toBe(true);
  });

  it("소수 금액과 0원은 거부한다", () => {
    const { w, item } = withItem();
    expect(w.try(saveExecution, { itemId: item, date: "2026-04-10", amount: 10.5, summary: "", vendor: "" }).ok).toBe(false);
    expect(w.try(saveExecution, { itemId: item, date: "2026-04-10", amount: 0, summary: "", vendor: "" }).ok).toBe(false);
  });

  it("지운 집행은 잔액에서 빠지고 되돌리면 다시 들어온다", () => {
    const { w, item } = withItem();
    const id = w.run(saveExecution, { itemId: item, date: "2026-04-10", amount: 100_000, summary: "", vendor: "" });
    w.run(deleteExecution, { id, reason: "중복 입력" });
    expect(buildIndex(w.data).spentByItem.get(item) ?? 0).toBe(0);
    w.run(restoreExecution, { id });
    expect(buildIndex(w.data).spentByItem.get(item)).toBe(100_000);
  });
});

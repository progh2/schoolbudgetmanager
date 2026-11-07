// 테스트용 가상 학교 자료 (실제 학교 자료는 저장소에 넣지 않는다)
import type { Data } from "../schema/entities";
import {
  changeProjectStatus, createFiscalYear, defaultFiscalYear, saveAllocation, saveDepartment, saveExecution, saveItem, saveProject,
} from "./commands";
import { world } from "./testkit";

export function buildFixtureWorld() {
  const w = world();
  const fy = w.run(createFiscalYear, defaultFiscalYear(2026));
  const d1 = w.run(saveDepartment, { name: "교무부" });
  const d2 = w.run(saveDepartment, { name: "정보부" });
  const p = w.run(saveProject, { fiscalYearId: fy, name: "방과후학교", ownerDepartmentId: d1, total: 10_000_000, memo: "" });
  const a1 = w.run(saveAllocation, { projectId: p, departmentId: d1, amount: 6_000_000, basis: 300, memo: "" });
  const a2 = w.run(saveAllocation, { projectId: p, departmentId: d2, amount: 3_000_000, basis: 120, memo: "" });
  const i1 = w.run(saveItem, { allocationId: a1, code: "강사수당", name: "강사수당", limit: 5_000_000, dueDate: "2027-02-15", requiredEvidence: ["proposal", "resolution"] });
  const i2 = w.run(saveItem, { allocationId: a2, code: "운영비", name: "교재·재료비", limit: 2_000_000, dueDate: "2026-12-31", requiredEvidence: ["receipt"] });
  w.run(changeProjectStatus, { id: p, action: "start" });
  w.run(saveExecution, { itemId: i1, date: "2026-04-25", amount: 1_200_000, summary: "4월 방과후 강사수당", vendor: "" });
  w.run(saveExecution, { itemId: i2, date: "2026-04-28", amount: 345_000, summary: "코딩 교재 구입", vendor: "OO서점" });
  return { w, ids: { fy, d1, d2, p, a1, a2, i1, i2 } };
}

export function createExecutionFixture(): Data {
  return buildFixtureWorld().w.data;
}

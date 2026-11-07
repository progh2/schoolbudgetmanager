// #07 사업별·부서별 현황표 내보내기
import { allocationSummary, buildIndex, departmentRows, projectSummary } from "../domain/balance";
import { PROJECT_STATUS_LABEL } from "../domain/project";
import type { Data } from "../schema/entities";
import { buildWorkbook, type SheetSpec } from "./xlsx";

export function summarySheets(data: Data, fiscalYearId: string): SheetSpec[] {
  const idx = buildIndex(data);
  const dept = new Map(data.departments.map((d) => [d.id, d.name]));
  const projects = [...idx.projects.values()].filter((p) => p.fiscalYearId === fiscalYearId).sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const byProject: SheetSpec = {
    name: "사업별",
    header: ["사업", "상태", "주관 부서", "총액", "배정", "미배정", "집행", "잔액", "집행률"],
    moneyCols: [3, 4, 5, 6, 7], rateCols: [8],
    rows: projects.map((p) => {
      const s = projectSummary(idx, p);
      return [p.name, PROJECT_STATUS_LABEL[p.status], dept.get(p.ownerDepartmentId ?? "") ?? "", p.total, s.allocated, s.unallocated, s.spent, s.remaining, s.rate];
    }),
  };
  const byAllocation: SheetSpec = {
    name: "배정별",
    header: ["사업", "부서", "배정", "집행", "잔액", "집행률", "기준값", "기준값당 배정"],
    moneyCols: [2, 3, 4, 7], rateCols: [5],
    rows: projects.flatMap((p) => (idx.allocationsByProject.get(p.id) ?? []).map((a) => {
      const s = allocationSummary(idx, a);
      return [p.name, dept.get(a.departmentId) ?? "", a.amount, s.spent, s.remaining, s.rate, a.basis, a.basis ? Math.round(a.amount / a.basis) : null];
    })),
  };
  const byDept: SheetSpec = {
    name: "부서별",
    header: ["부서", "배정", "집행", "잔액", "집행률", "기준값", "기준값당 배정"],
    moneyCols: [1, 2, 3, 6], rateCols: [4],
    rows: departmentRows(idx, fiscalYearId).map((r) => [dept.get(r.departmentId) ?? "", r.allocated, r.spent, r.remaining, r.rate, r.basis, r.perBasis]),
  };
  return [byProject, byAllocation, byDept];
}

export function exportSummary(data: Data, fiscalYearId: string, now: string): Uint8Array {
  const sheets = summarySheets(data, fiscalYearId);
  const fy = data.fiscalYears.find((f) => f.id === fiscalYearId);
  return buildWorkbook(sheets, [
    ["회계연도", fy?.label ?? ""],
    ["내보낸 시각", now],
    ["사업 수", sheets[0].rows.length],
    ["배정 수", sheets[1].rows.length],
    ["안내", "잔액·집행률은 내보낸 시각의 집행 내역으로 계산했어요. 미분류 집행은 들어가지 않아요."],
    ["미분류 집행 건수", buildIndex(data).unclassified.length],
  ]);
}

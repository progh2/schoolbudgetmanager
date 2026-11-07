import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildFixtureWorld } from "../domain/fixtures";
import { emptyData } from "../schema/entities";
import { exportSummary, summarySheets } from "./summary";

describe("현황표 엑셀", () => {
  it("화면 합계와 파일 합계가 같고 금액은 숫자 셀이다", () => {
    const { w, ids } = buildFixtureWorld();
    const wb = XLSX.read(exportSummary(w.data, ids.fy, "2026-04-30T00:00:00Z"));
    expect(wb.SheetNames).toEqual(["사업별", "배정별", "부서별", "요약"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["사업별"]);
    expect(rows[0]).toMatchObject({ 사업: "방과후학교", 총액: 10_000_000, 배정: 9_000_000, 미배정: 1_000_000, 집행: 1_545_000 });
    const cell = wb.Sheets["사업별"]["D2"];
    expect(cell.t).toBe("n");
    const dept = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["부서별"]);
    expect(dept.reduce((s, r) => s + (r["집행"] as number), 0)).toBe(1_545_000);
    expect(dept.find((r) => r["부서"] === "교무부")).toMatchObject({ 기준값: 300, "기준값당 배정": 20_000 });
  });

  it("자료가 없어도 머리글과 요약이 있는 파일을 만든다", () => {
    const data = emptyData();
    const wb = XLSX.read(exportSummary(data, "없음", "2026-04-30T00:00:00Z"));
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets["사업별"], { header: 1 })[0]).toContain("사업");
    expect(summarySheets(data, "없음").every((s) => s.rows.length === 0)).toBe(true);
  });
});

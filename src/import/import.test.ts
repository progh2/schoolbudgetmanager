import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { applyWrites } from "../domain/apply";
import { buildIndex } from "../domain/balance";
import { buildFixtureWorld } from "../domain/fixtures";
import { applyUpload, revertUpload } from "../domain/upload";
import { findHeaderRow } from "./header";
import { guessColumns, headerSignature } from "./mapping";
import { parseAmount, parseDate } from "./parse";
import { assignManually, buildPlan } from "./plan";
import { readSpreadsheet } from "./read";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../../tests/fixtures", name)));

function xlsxBytes(aoa: unknown[][], merges: XLSX.Range[] = [], dateCells: string[] = []) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  for (const a of dateCells) ws[a].z = "yyyy-mm-dd";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "집행");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("셀 해석", () => {
  it("금액: 콤마·원·괄호·△·소수 0", () => {
    expect(parseAmount("1,234,000")).toBe(1234000);
    expect(parseAmount("1,000원")).toBe(1000);
    expect(parseAmount("(12,000)")).toBe(-12000);
    expect(parseAmount("△5,000")).toBe(-5000);
    expect(parseAmount("-700")).toBe(-700);
    expect(parseAmount("1000.0")).toBe(1000);
    expect(parseAmount("10.5")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("합계")).toBeNull();
  });

  it("날짜: 여러 꼴은 받고 연도 없는 것과 없는 날은 거부", () => {
    for (const s of ["2026-03-02", "2026.3.2", "2026. 3. 2.", "2026/03/02", "20260302", "2026-03-02 14:00:00", "2026년 3월 2일", "46083"])
      expect(parseDate(s), s).toBe("2026-03-02");
    for (const s of ["3/2", "03-02", "2026-02-30", "2026-13-01", "abc", ""]) expect(parseDate(s), s).toBeNull();
  });
});

describe("파일 읽기", () => {
  it("CP949 CSV: 인코딩을 알아내고 제목·조회조건 행을 건너뛰어 머리글을 찾는다", () => {
    const r = readSpreadsheet(fixture("edufine-cp949.csv"), "집행.csv");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.encoding).toBe("cp949");
    const rows = r.sheets[0].rows;
    const h = findHeaderRow(rows);
    expect(rows[h]).toEqual(["지출결의일자", "세부사업", "통계목", "적요", "거래처", "집행액"]);
    expect(guessColumns(rows[h])).toEqual({ date: 0, projectName: 1, itemCode: 2, summary: 3, vendor: 4, amount: 5 });
  });

  it("xlsx: 병합된 제목은 머리글로 오인하지 않고, 병합된 분류 칸은 채운다, 날짜 서식 숫자는 ISO로", () => {
    const serial = 46137; // 2026-04-25
    const bytes = xlsxBytes(
      [
        ["2026 집행 현황", "", "", ""],
        ["", "", "", ""],
        ["일자", "세부사업", "적요", "금액"],
        [serial, "방과후학교", "강사수당", 1000],
        [serial, "", "교재", 2000],
      ],
      [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }],
      ["A4", "A5"],
    );
    const r = readSpreadsheet(bytes, "a.xlsx");
    if (!r.ok) throw new Error(r.message);
    const rows = r.sheets[0].rows;
    expect(findHeaderRow(rows)).toBe(2);
    expect(rows[4]).toEqual(["2026-04-25", "방과후학교", "교재", "2000"]);
  });

  it("깨진 파일은 이유를 말한다", () => {
    const r = readSpreadsheet(new Uint8Array([0xff, 0xfe, 0x00, 0xd8, 0x00]), "x.csv");
    expect(r.ok).toBe(false);
  });
});

function planFromFixture(w = buildFixtureWorld()) {
  const r = readSpreadsheet(fixture("edufine-cp949.csv"), "집행.csv");
  if (!r.ok) throw new Error(r.message);
  const rows = r.sheets[0].rows;
  const headerRow = findHeaderRow(rows);
  const fy = w.w.data.fiscalYears[0];
  return { w, rows, headerRow, plan: buildPlan(w.w.data, { rows, headerRow, columns: guessColumns(rows[headerRow]), rules: [], fiscalYear: fy }) };
}

describe("미리보기", () => {
  it("검산: 읽은 행 = 신규 + 이미 있음 + 짝 없음 + 제외, 합계가 원 단위까지 맞는다", () => {
    // 픽스처 세상에는 강사수당 1,200,000원·교재 345,000원이 수동 입력으로 이미 있다(고유키 없음) → 업로드에서는 신규로 본다
    const { plan } = planFromFixture();
    const c = plan.counts;
    expect(c.read).toBe(6);
    expect(c.new + c.duplicate + c.unmatched + c.excluded).toBe(c.read);
    expect(plan.excludedBy).toEqual({ "합계 행": 1 });
    // 같은 날·같은 금액·같은 적요 두 건은 둘 다 들어간다
    const books = plan.rows.filter((r) => r.summary === "코딩 교재 구입");
    expect(books.map((r) => r.status)).toEqual(["new", "new"]);
    expect(new Set(books.map((r) => r.dedupeKey)).size).toBe(2);
    // 돌봄교실·여비는 맞는 항목이 없다
    expect(plan.rows.filter((r) => r.status === "unmatched").map((r) => r.summary)).toEqual(["강사 교통비", "5월 간식"]);
    // 합계 1,966,000 = 신규 + 짝 없음
    expect(plan.sums.new + plan.sums.unmatched).toBe(1_966_000);
  });

  it("같은 파일을 두 번 올리면 두 번째는 신규 0건", () => {
    const { w, rows, headerRow, plan } = planFromFixture();
    const r = applyUpload(w.w.data, { fileName: "a.csv", fileHash: "h", profileId: null, rows: plan.rows }, w.w.ctx);
    if (!r.ok) throw new Error(r.message);
    const data = applyWrites(w.w.data, r.writes);
    const again = buildPlan(data, { rows, headerRow, columns: guessColumns(rows[headerRow]), rules: [], fiscalYear: data.fiscalYears[0] });
    expect(again.counts.new).toBe(0);
    expect(again.counts.unmatched).toBe(0);
    expect(again.counts.duplicate).toBe(5);
  });

  it("되돌린 업로드는 다시 올릴 수 있다", () => {
    const { w, rows, headerRow, plan } = planFromFixture();
    const r = applyUpload(w.w.data, { fileName: "a.csv", fileHash: "h", profileId: null, rows: plan.rows }, w.w.ctx);
    if (!r.ok) throw new Error(r.message);
    let data = applyWrites(w.w.data, r.writes);
    const spentAfter = buildIndex(data).spentByItem.get(w.ids.i1);
    expect(spentAfter).toBe(2_400_000);
    const rv = revertUpload(data, { batchId: r.id!, reason: "잘못된 파일" }, w.w.ctx);
    if (!rv.ok) throw new Error(rv.message);
    data = applyWrites(data, rv.writes);
    expect(buildIndex(data).spentByItem.get(w.ids.i1)).toBe(1_200_000);
    const again = buildPlan(data, { rows, headerRow, columns: guessColumns(rows[headerRow]), rules: [], fiscalYear: data.fiscalYears[0] });
    expect(again.counts.new).toBe(3);
  });

  it("한도 초과 행도 반영하되 표시한다 (에듀파인이 기준)", () => {
    const { plan } = planFromFixture();
    // 교재·재료비 한도 2,000,000, 이미 345,000 → 345,000 두 건 더해도 안 넘음
    expect(plan.counts.overLimit).toBe(0);
  });

  it("짝 없는 행을 손으로 연결하면 신규로 바뀌고 건수가 다시 맞는다", () => {
    const { w, plan } = planFromFixture();
    const line = plan.rows.find((r) => r.summary === "강사 교통비")!.line;
    const next = assignManually(w.w.data, plan, line, w.ids.i1);
    expect(next.counts.unmatched).toBe(1);
    expect(next.counts.new).toBe(plan.counts.new + 1);
    expect(next.rows.find((r) => r.line === line)?.matchedBy).toBe("manual");
  });

  it("규칙을 저장하면 다음 업로드에서 자동으로 맞춘다", () => {
    const { w, rows, headerRow } = planFromFixture();
    const plan = buildPlan(w.w.data, {
      rows, headerRow, columns: guessColumns(rows[headerRow]), fiscalYear: w.w.data.fiscalYears[0],
      rules: [{ field: "itemCode", value: "여비", itemId: w.ids.i1 }],
    });
    expect(plan.rows.find((r) => r.summary === "강사 교통비")).toMatchObject({ status: "new", matchedBy: "rule", itemId: w.ids.i1 });
  });

  it("머리글 서명은 공백 차이를 무시한다", () => {
    expect(headerSignature(["지출 결의일자", " 금액"])).toBe(headerSignature(["지출결의일자", "금액"]));
  });
});

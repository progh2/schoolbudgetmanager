// 엑셀 내보내기 공통. 표 하나 = 시트 하나, 금액은 숫자 서식(문자열 금지), 마지막에 "요약" 시트.
// 0건이어도 머리글과 요약을 담아 만든다 — 빈 파일은 고장처럼 보인다.
import * as XLSX from "xlsx";

export type Cell = string | number | null;
export interface SheetSpec {
  name: string;
  header: string[];
  rows: Cell[][];
  /** 금액 서식을 줄 열 번호 */
  moneyCols?: number[];
  /** 백분율 서식을 줄 열 번호 (0.25 = 25%) */
  rateCols?: number[];
}

export function buildWorkbook(sheets: SheetSpec[], summary: [string, Cell][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows]);
    const width = s.header.map((h, c) => Math.min(60, Math.max(h.length * 2 + 2, ...s.rows.map((r) => String(r[c] ?? "").length + 2))));
    ws["!cols"] = width.map((wch) => ({ wch }));
    for (let r = 1; r <= s.rows.length; r++) {
      for (const c of s.moneyCols ?? []) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === "n") cell.z = "#,##0";
      }
      for (const c of s.rateCols ?? []) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === "n") cell.z = "0.0%";
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const sum = XLSX.utils.aoa_to_sheet([["항목", "값"], ...summary]);
  sum["!cols"] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, sum, "요약");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

export { XLSX_MIME } from "./mime";

// 엑셀·CSV → 문자열 격자. 모든 셀을 텍스트로 읽고, 병합 셀은 왼쪽 위 값으로 채운다.
// SheetJS가 무거워서 UI는 이 파일을 지연 로딩한다.
import * as XLSX from "xlsx";
import { fail, type Result } from "../domain/ctx";
import { serialToIso } from "./parse";

export interface Sheet { name: string; rows: string[][] }

/** CSV 인코딩: UTF-8(BOM 포함) → 안 되면 CP949(euc-kr). 둘 다 깨지면 멈춘다 */
export function decodeText(bytes: Uint8Array): Result<{ text: string; encoding: "utf-8" | "cp949" }> {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch { /* CP949로 다시 */ }
  try {
    const text = new TextDecoder("euc-kr", { fatal: true }).decode(bytes);
    return { ok: true, text, encoding: "cp949" };
  } catch {
    return fail("encoding", "글자 인코딩을 알아내지 못했어요. 엑셀에서 'CSV UTF-8'로 다시 저장하거나 .xlsx로 올려 주세요.");
  }
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  switch (cell.t) {
    case "n": {
      const v = cell.v as number;
      if (cell.z && XLSX.SSF.is_date(cell.z)) return serialToIso(v) ?? String(v);
      // 서식 문자열(1,234)이 아니라 원래 숫자를 쓴다. 정수가 아니면 그대로 두고 parseAmount가 거른다
      return String(v);
    }
    case "d": return (cell.v as Date).toISOString().slice(0, 10);
    case "b": return cell.v ? "TRUE" : "FALSE";
    case "e": return "";
    default: return String(cell.v);
  }
}

function toGrid(ws: XLSX.WorkSheet): string[][] {
  if (!ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) row.push(cellText(ws[XLSX.utils.encode_cell({ r, c })]));
    rows.push(row);
  }
  for (const m of ws["!merges"] ?? []) {
    const v = rows[m.s.r - range.s.r]?.[m.s.c - range.s.c] ?? "";
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) rows[r - range.s.r][c - range.s.c] = v;
  }
  return rows;
}

export function readSpreadsheet(bytes: Uint8Array, fileName: string): Result<{ sheets: Sheet[]; encoding?: string }> {
  const isText = /\.(csv|txt)$/i.test(fileName);
  let wb: XLSX.WorkBook;
  let encoding: string | undefined;
  try {
    if (isText) {
      const t = decodeText(bytes);
      if (!t.ok) return t;
      encoding = t.encoding;
      wb = XLSX.read(t.text, { type: "string", raw: true });
    } else {
      wb = XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false });
    }
  } catch {
    return fail("unreadable", "파일을 읽지 못했어요. 엑셀(.xlsx·.xls) 또는 CSV 파일인지 확인해 주세요.");
  }
  const sheets = wb.SheetNames.map((name) => ({ name, rows: toGrid(wb.Sheets[name]) })).filter((s) => s.rows.some((r) => r.some(Boolean)));
  if (sheets.length === 0) return fail("empty", "파일에 내용이 없어요.");
  return { ok: true, sheets, encoding };
}

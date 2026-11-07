// 머리글 행 찾기. 에듀파인 엑셀은 보통 제목 행(병합)·빈 행·조회 조건 행 뒤에 머리글이 온다.
// 병합된 제목은 모든 칸이 같은 값이라 "서로 다른 글자가 여럿"인지로 거른다.
import { parseAmount, parseDate } from "./parse";
import { normalizeKey } from "./text";

const isData = (s: string) => parseAmount(s) !== null || parseDate(s) !== null;

export function findHeaderRow(rows: string[][], scan = 30): number {
  const head = rows.slice(0, scan);
  const widths = head.map((r) => new Set(r.map(normalizeKey).filter(Boolean)).size);
  const max = Math.max(0, ...widths);
  for (let i = 0; i < head.length; i++) {
    const cells = head[i].map(normalizeKey).filter(Boolean);
    const distinct = new Set(cells).size;
    if (distinct < Math.max(2, Math.ceil(max * 0.5))) continue;
    const text = cells.filter((c) => !isData(c)).length;
    if (text / cells.length < 0.7) continue;
    const hasDataBelow = rows.slice(i + 1).some((r) => r.some((c) => isData(c)));
    if (hasDataBelow) return i;
  }
  return -1;
}

const TOTAL = /^(합\s*계|총\s*계|소\s*계|계|누\s*계)$/;
/** "합계" 행인지: 날짜 칸이 비었고 어느 칸이 합계·소계 */
export function isTotalRow(row: string[]): boolean {
  return row.some((c) => TOTAL.test(normalizeKey(c)));
}

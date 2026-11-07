// 셀 문자열 → 원 단위 정수 / ISO 날짜. 자동 형변환을 믿지 않고 직접 바꾼다.
import { normalizeKey } from "./text";

/** "1,234,000" "(1,000)" "△1,000" "-1000원" "1000.0" → 정수. 소수가 남으면 null */
export function parseAmount(raw: string): number | null {
  let s = normalizeKey(raw).replace(/[,\s원₩]/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[-△▲]/.test(s)) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  return neg ? -n : n;
}

function valid(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 엑셀 일련번호(1900 날짜 체계) → ISO */
export function serialToIso(serial: number): string | null {
  if (!(serial > 20000 && serial < 80000)) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86_400_000);
  const d = new Date(ms);
  return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * "2026-03-02" "2026.3.2" "2026. 3. 2." "2026/03/02" "20260302" "2026-03-02 14:00" → "2026-03-02".
 * 연도가 없는 날짜("3/2", "03-02")는 거부한다 — 짐작한 연도는 몇 년씩 틀린다.
 */
export function parseDate(raw: string): string | null {
  const s = normalizeKey(raw);
  if (!s) return null;
  let m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?(?:\s.*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialToIso(Number(s));
  return null;
}

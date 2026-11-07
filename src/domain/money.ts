const fmt = new Intl.NumberFormat("ko-KR");

export const formatWon = (n: number) => `${fmt.format(n)}원`;
export const formatNumber = (n: number) => fmt.format(n);

/** 비율 표시. 분모가 없으면 null → 화면은 이유를 보여 준다("0%"를 지어내지 않는다) */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export const formatRate = (r: number | null, empty = "—") =>
  r === null ? empty : `${(r * 100).toFixed(1)}%`;

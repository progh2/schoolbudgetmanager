// 날짜는 YYYY-MM-DD 문자열로 다룬다. 시간대 때문에 하루 밀리지 않게 UTC 정오로 계산한다.
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12);

/** b − a (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(d: string, n: number): string {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 오늘이 속한 학교 회계연도의 시작 연도(3월 시작) */
export function schoolYearOf(today: string): number {
  const y = +today.slice(0, 4);
  return +today.slice(5, 7) >= 3 ? y : y - 1;
}

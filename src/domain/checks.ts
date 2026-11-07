// 마감·한도 점검 (#15). 경고마다 근거(규칙·수치·기준일)를 함께 돌려준다 — "왜 빨간지"를 화면이 말할 수 있게.
// 오늘은 인자로 받는다(테스트에서 고정).
import { itemSummary, projectOfItem, type Index } from "./balance";
import { daysBetween } from "./dates";
import { formatWon } from "./money";

export type Severity = "danger" | "warn" | "info";
export interface Alert {
  kind: "due" | "limit";
  severity: Severity;
  itemId: string;
  projectId: string;
  title: string;
  basis: string;
  /** 정렬용: 작을수록 급하다 */
  rank: number;
}

const SEV_RANK: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };

export function dueAlerts(idx: Index, today: string): Alert[] {
  const out: Alert[] = [];
  for (const it of idx.items.values()) {
    if (!it.dueDate) continue;
    const p = projectOfItem(idx, it.id);
    if (!p || p.status !== "operating") continue;
    const s = itemSummary(idx, it);
    if (s.remaining <= 0) continue; // 쓸 돈이 없으면 기한은 문제가 아니다
    const d = daysBetween(today, it.dueDate);
    let severity: Severity;
    let rule: string;
    if (d < 0) { severity = "danger"; rule = "사용기한 지남"; }
    else if (d <= 1) { severity = "danger"; rule = "사용기한 D-1 이내"; }
    else if (d <= 7) { severity = "warn"; rule = "사용기한 D-7 이내"; }
    else if (d <= 14) { severity = "info"; rule = "사용기한 D-14 이내"; }
    else continue;
    const dday = d < 0 ? `D+${-d}` : d === 0 ? "D-day" : `D-${d}`;
    out.push({
      kind: "due", severity, itemId: it.id, projectId: p.id, rank: SEV_RANK[severity] * 1000 + d,
      title: `${it.name} ${dday} · 남은 돈 ${formatWon(s.remaining)}`,
      basis: `${rule} · 기한 ${it.dueDate} · 기준일 ${today} · 한도 ${formatWon(it.limit)} 중 ${formatWon(s.spent)} 집행`,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export function limitAlerts(idx: Index): Alert[] {
  const out: Alert[] = [];
  for (const it of idx.items.values()) {
    const p = projectOfItem(idx, it.id);
    if (!p || p.status === "closed") continue;
    const s = itemSummary(idx, it);
    if (!s.executed) continue;
    let severity: Severity;
    let rule: string;
    if (s.spent > it.limit) { severity = "danger"; rule = `한도 초과 ${formatWon(s.spent - it.limit)}`; }
    else if (it.limit > 0 && s.spent === it.limit) { severity = "warn"; rule = "한도 100% 사용"; }
    else if (it.limit > 0 && s.spent >= it.limit * 0.9) { severity = "info"; rule = "한도 90% 이상 사용"; }
    else continue;
    out.push({
      kind: "limit", severity, itemId: it.id, projectId: p.id, rank: SEV_RANK[severity] * 1000 - Math.round((s.rate ?? 9) * 100),
      title: `${it.name} ${rule}`,
      basis: `한도 ${formatWon(it.limit)} · 집행 ${formatWon(s.spent)} (${s.executionCount}건) · 잔액 ${formatWon(s.remaining)}`,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

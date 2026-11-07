// 대시보드 경고 위젯 (#16). 정의:
// - 마감 임박: 운영 중 사업의 항목 중 사용기한 14일 이내(또는 지남)이고 잔액이 남은 것. 0건이면 "없음"(정상)
// - 한도 위험: 마감 안 한 사업의 항목 중 집행 ≥ 한도 90%. 집행 없는 항목은 세지 않는다
// - 증빙 미비: 이 회계연도 집행 중 필수 증빙이 없거나 일부거나 보완 필요. 분모 = 이 회계연도 집행 수
// - 미분류: 항목에 잇지 않은 집행. 잔액 계산에서 빠져 있으니 0이어야 정상
import { useMemo, useState } from "react";
import { buildIndex } from "../../domain/balance";
import { dueAlerts, limitAlerts, type Alert } from "../../domain/checks";
import { realCtx } from "../../domain/ctx";
import { evidenceChecklist, isEvidenceLacking } from "../../domain/evidence";
import { formatNumber } from "../../domain/money";
import { useFiscalYear, useStore } from "../../state/store";
import { Won } from "./ui";

const TONE = { danger: "border-l-red-600", warn: "border-l-amber-500", info: "border-l-sky-500" };

function AlertList({ title, alerts, empty }: { title: string; alerts: Alert[]; empty: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? alerts : alerts.slice(0, 5);
  return (
    <div className="rounded border border-stone-200 bg-white p-3">
      <h3 className="mb-2 font-semibold">{title} <span className="text-sm font-normal text-stone-500">{alerts.length}건</span></h3>
      {alerts.length === 0 ? <p className="text-sm text-stone-500">{empty}</p> : (
        <ul className="space-y-1">
          {shown.map((a) => (
            <li key={a.kind + a.itemId} className={`border-l-4 pl-2 text-sm ${TONE[a.severity]}`}>
              <a className="hover:underline" href={`#/projects/${a.projectId}`}>{a.title}</a>
              <div className="text-xs text-stone-500">{a.basis}</div>
            </li>
          ))}
        </ul>
      )}
      {alerts.length > 5 && !all && <button type="button" className="mt-1 text-xs text-emerald-800 underline" onClick={() => setAll(true)}>{alerts.length - 5}건 더 보기</button>}
    </div>
  );
}

export function DashboardWidgets() {
  const data = useStore((s) => s.data);
  const fy = useFiscalYear();
  const today = realCtx().today;
  const { due, limit, lacking, total, unclassified } = useMemo(() => {
    // 이 회계연도 사업만 본다
    const idx = buildIndex({ ...data, projects: data.projects.filter((p) => p.fiscalYearId === fy?.id) });
    const list = fy ? evidenceChecklist(data, fy) : [];
    const inYear = idx.unclassified.filter((e) => fy && e.date >= fy.start && e.date <= fy.end);
    return {
      due: dueAlerts(idx, today), limit: limitAlerts(idx),
      lacking: list.filter((r) => isEvidenceLacking(r.judgement)).length, total: list.length,
      unclassified: { count: inYear.length, sum: inYear.reduce((s, e) => s + e.amount, 0) },
    };
  }, [data, fy, today]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AlertList title="마감 임박" alerts={due} empty="14일 안에 사용기한이 끝나는 항목이 없어요." />
      <AlertList title="한도 위험" alerts={limit} empty="한도 90%를 넘긴 항목이 없어요." />
      <a href="#/evidence" className="rounded border border-stone-200 bg-white p-3 hover:bg-stone-50">
        <h3 className="font-semibold">증빙 미비</h3>
        {total === 0 ? <p className="text-sm text-stone-500">아직 집행이 없어요.</p>
          : <p className="text-sm"><b className={lacking ? "text-amber-700" : ""}>{formatNumber(lacking)}건</b> / 집행 {formatNumber(total)}건 (없음·일부·보완 필요)</p>}
      </a>
      <a href="#/executions" className="rounded border border-stone-200 bg-white p-3 hover:bg-stone-50">
        <h3 className="font-semibold">미분류 집행</h3>
        {unclassified.count === 0 ? <p className="text-sm text-stone-500">없어요. 모든 집행이 항목에 이어져 있어요.</p>
          : <p className="text-sm text-amber-700"><b>{formatNumber(unclassified.count)}건</b> · <Won n={unclassified.sum} /> — 잔액 계산에서 빠져 있어요. 항목을 골라 주세요.</p>}
      </a>
    </div>
  );
}

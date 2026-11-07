import { departmentRows, projectSummary } from "../../domain/balance";
import { realCtx } from "../../domain/ctx";
import { XLSX_MIME } from "../../export/mime";
import { useFiscalYear, useStore } from "../../state/store";
import { DashboardWidgets } from "../components/DashboardWidgets";
import { Button, Empty, Rate, Section, Won, download } from "../components/ui";

export function Dashboard() {
  const { data, idx } = useStore();
  const fy = useFiscalYear();
  if (!fy) return null;
  const projects = [...idx.projects.values()].filter((p) => p.fiscalYearId === fy.id).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const sums = projects.map((p) => projectSummary(idx, p));
  const total = sums.reduce((s, x) => s + x.budget, 0);
  const spent = sums.reduce((s, x) => s + x.spent, 0);
  const executed = sums.some((s) => s.executed);
  const deptName = new Map(data.departments.map((d) => [d.id, d.name]));
  const depts = departmentRows(idx, fy.id).sort((a, b) => (deptName.get(a.departmentId) ?? "").localeCompare(deptName.get(b.departmentId) ?? "", "ko"));

  async function exportXlsx() {
    const ctx = realCtx();
    // SheetJS는 무거워서 누를 때 불러온다 (첫 화면을 가볍게)
    const { exportSummary } = await import("../../export/summary");
    download(exportSummary(data, fy!.id, ctx.now), `예산현황-${fy!.label}-${ctx.today}.xlsx`, XLSX_MIME);
  }

  if (projects.length === 0)
    return <Empty>{fy.label} 회계연도에 등록한 사업이 없어요. <a className="underline" href="#/projects">목적사업</a>에서 시작하세요.</Empty>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-6 rounded border border-stone-200 bg-white p-4">
        <div><div className="text-sm text-stone-500">총 예산 ({projects.length}개 사업)</div><div className="text-2xl font-bold"><Won n={total} /></div></div>
        <div><div className="text-sm text-stone-500">집행</div><div className="text-2xl font-bold"><Won n={spent} /></div></div>
        <div><div className="text-sm text-stone-500">잔액</div><div className="text-2xl font-bold"><Won n={total - spent} /></div></div>
        <div><div className="text-sm text-stone-500">집행률 (집행 ÷ 총 예산)</div><div className="text-2xl font-bold"><Rate rate={total > 0 ? spent / total : null} executed={executed} emptyLabel="예산 없음" /></div></div>
        <span className="flex-1" />
        <Button onClick={exportXlsx}>엑셀로 내보내기</Button>
      </div>

      <DashboardWidgets />

      <Section title="사업별">
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="tbl">
            <thead><tr><th>사업</th><th className="num">총액</th><th className="num">집행</th><th className="num">잔액</th><th>집행률</th></tr></thead>
            <tbody>
              {projects.map((p, i) => {
                const s = sums[i];
                const w = s.rate === null ? 0 : Math.min(100, s.rate * 100);
                return (
                  <tr key={p.id}>
                    <td><a className="underline" href={`#/projects/${p.id}`}>{p.name}</a></td>
                    <td className="num"><Won n={s.budget} /></td>
                    <td className="num"><Won n={s.spent} /></td>
                    <td className="num"><Won n={s.remaining} /></td>
                    <td className="w-64">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-stone-200" aria-hidden><div className={`h-2 rounded ${s.rate !== null && s.rate > 1 ? "bg-red-600" : "bg-emerald-700"}`} style={{ width: `${w}%` }} /></div>
                        <span className="w-20 text-right text-xs"><Rate rate={s.rate} executed={s.executed} emptyLabel="총액 없음" /></span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="부서별 (이 회계연도 모든 사업 합계)">
        {depts.length === 0 ? <Empty>아직 부서에 배정한 금액이 없어요.</Empty> : (
          <div className="overflow-x-auto rounded border border-stone-200 bg-white">
            <table className="tbl">
              <thead><tr><th>부서</th><th className="num">배정</th><th className="num">집행</th><th className="num">잔액</th><th className="num">집행률</th><th className="num">기준값당 배정</th></tr></thead>
              <tbody>
                {depts.map((r) => (
                  <tr key={r.departmentId}>
                    <td>{deptName.get(r.departmentId)}</td>
                    <td className="num"><Won n={r.allocated} /></td>
                    <td className="num"><Won n={r.spent} /></td>
                    <td className="num"><Won n={r.remaining} /></td>
                    <td className="num"><Rate rate={r.rate} executed={r.executed} /></td>
                    <td className="num">{r.perBasis === null ? <span className="text-stone-500">기준값 없음</span> : <Won n={r.perBasis} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-stone-500">기준값당 배정은 그 부서의 모든 배정에 기준값(학생 수 등)을 적었을 때만 계산해요. 공평한 기준은 학교마다 달라서 비교 자료만 보여 줘요.</p>
      </Section>
    </div>
  );
}

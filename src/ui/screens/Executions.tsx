import { useMemo, useRef, useState } from "react";
import { assignExecutionItem, deleteExecution, restoreExecution, saveExecution } from "../../domain/commands";
import { realCtx } from "../../domain/ctx";
import { judgeEvidence, evidenceStateLabel } from "../../domain/evidence";
import { formatNumber } from "../../domain/money";
import type { Execution } from "../../schema/entities";
import { useFiscalYear, useStore } from "../../state/store";
import { itemOptions } from "../itemOptions";
import { Banner, Button, ConfirmBar, Empty, Field, MoneyInput, Section, Won, parseWonInput, useFlash } from "../components/ui";

const PAGE = 50;

function NewExecution() {
  const { data, idx, run } = useStore();
  const fy = useFiscalYear();
  const opts = useMemo(() => itemOptions(data, idx, fy?.id), [data, idx, fy?.id]);
  const [f, setF] = useState({ itemId: "", date: realCtx().today, amount: "", summary: "", vendor: "" });
  const [overReason, setOverReason] = useState<string | null>(null);
  const { flash, setFlash } = useFlash();
  const amountRef = useRef<HTMLInputElement>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const amount = parseWonInput(f.amount);
    if (amount === null) return setFlash({ tone: "error", text: "금액을 숫자로 적어 주세요." });
    const r = await run(saveExecution, { itemId: f.itemId || null, date: f.date, amount, summary: f.summary, vendor: f.vendor, overLimitReason: overReason ?? undefined });
    if (!r.ok) {
      if (r.code === "over_limit") setOverReason("");
      return setFlash({ tone: r.code === "over_limit" ? "warn" : "error", text: r.message });
    }
    setFlash({ tone: "ok", text: `${formatNumber(amount)}원 집행을 넣었어요.` });
    setOverReason(null);
    setF({ ...f, amount: "", summary: "", vendor: "" });
    amountRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="항목">
          <select className="input max-w-md" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })}>
            <option value="">(미분류)</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="집행일"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="금액(반납은 −)"><MoneyInput ref={amountRef} allowNegative value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="적요"><input className="input w-56" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <Field label="거래처"><input className="input w-36" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
        <Button kind="primary" type="submit" disabled={!f.amount}>넣기</Button>
      </div>
      {overReason !== null && (
        <Field label="한도를 넘기는 이유 (적으면 반영돼요)">
          <input autoFocus className="input w-full" value={overReason} onChange={(e) => setOverReason(e.target.value)} placeholder="예: 강사 추가 배정, ○월 ○일 교장 결재" />
        </Field>
      )}
      {flash}
    </form>
  );
}

function Row({ e, setFlash }: { e: Execution; setFlash: ReturnType<typeof useFlash>["setFlash"] }) {
  const { data, idx, run } = useStore();
  const fy = useFiscalYear();
  const [ask, setAsk] = useState(false);
  const opt = e.itemId ? itemOptions(data, idx, fy?.id, true).find((o) => o.id === e.itemId) : null;
  const item = e.itemId ? idx.items.get(e.itemId) ?? null : null;
  const ev = judgeEvidence(item, data.evidences.filter((x) => x.executionId === e.id));
  const opts = !e.itemId && !e.deletedAt ? itemOptions(data, idx, fy?.id) : [];

  return (
    <>
      <tr className={e.deletedAt ? "text-stone-400 line-through" : ""}>
        <td className="whitespace-nowrap tabular-nums">{e.date}</td>
        <td>
          {opt ? opt.label : e.deletedAt ? "—" : (
            <select aria-label="항목 연결" className="input border-amber-400" value="" onChange={async (ev2) => { const r = await run(assignExecutionItem, { id: e.id, itemId: ev2.target.value }); if (!r.ok) setFlash({ tone: "error", text: r.message }); }}>
              <option value="">미분류 — 항목 고르기</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </td>
        <td>{e.summary}{e.vendor && <span className="text-stone-500"> · {e.vendor}</span>}{e.overLimitReason && <div className="text-xs text-amber-700">한도 초과 사유: {e.overLimitReason}</div>}</td>
        <td className="num"><Won n={e.amount} /></td>
        <td className="text-xs">{e.source === "upload" ? "업로드" : "직접"}</td>
        <td className="text-xs"><a className="underline" href={`#/evidence?e=${e.id}`}>{evidenceStateLabel[ev.state]}{ev.count > 0 && ` (${ev.count})`}</a></td>
        <td className="whitespace-nowrap">
          {e.deletedAt
            ? <Button kind="ghost" onClick={async () => { const r = await run(restoreExecution, { id: e.id }); if (!r.ok) setFlash({ tone: "error", text: r.message }); }}>되돌리기</Button>
            : <Button kind="ghost" className="text-red-700" onClick={() => setAsk(true)}>지우기</Button>}
        </td>
      </tr>
      {ask && (
        <tr><td colSpan={7}>
          <ConfirmBar message="이 집행을 지울까요? 지운 것은 '지운 것 보기'에서 되돌릴 수 있어요." needReason="지우는 이유" confirmLabel="지우기" onCancel={() => setAsk(false)}
            onConfirm={async (reason) => { const r = await run(deleteExecution, { id: e.id, reason }); setAsk(false); if (!r.ok) setFlash({ tone: "error", text: r.message }); }} />
        </td></tr>
      )}
    </>
  );
}

export function Executions() {
  const { data, idx } = useStore();
  const fy = useFiscalYear();
  const { flash, setFlash } = useFlash();
  const [q, setQ] = useState({ project: "", dept: "", text: "", from: "", to: "", unclassified: false, deleted: false });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const inYear = (d: string) => !fy || (d >= fy.start && d <= fy.end);
    return data.executions
      .filter((e) => (q.deleted ? true : !e.deletedAt) && inYear(e.date))
      .filter((e) => {
        const it = e.itemId ? idx.items.get(e.itemId) : undefined;
        const a = it && idx.allocations.get(it.allocationId);
        if (q.unclassified && it) return false;
        if (q.project && a?.projectId !== q.project) return false;
        if (q.dept && a?.departmentId !== q.dept) return false;
        if (q.from && e.date < q.from) return false;
        if (q.to && e.date > q.to) return false;
        if (q.text && !`${e.summary} ${e.vendor}`.includes(q.text)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data.executions, idx, q, fy]);

  const sum = rows.filter((e) => !e.deletedAt).reduce((s, e) => s + e.amount, 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const set = (patch: Partial<typeof q>) => { setQ({ ...q, ...patch }); setPage(0); };
  const projects = data.projects.filter((p) => !p.deletedAt && p.fiscalYearId === fy?.id);

  return (
    <div className="space-y-6">
      <Section title="집행 넣기"><NewExecution /></Section>
      <Section title="집행 내역">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <select aria-label="사업" className="input" value={q.project} onChange={(e) => set({ project: e.target.value })}>
            <option value="">모든 사업</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="부서" className="input" value={q.dept} onChange={(e) => set({ dept: e.target.value })}>
            <option value="">모든 부서</option>
            {data.departments.filter((d) => !d.deletedAt).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="date" aria-label="시작일" className="input" value={q.from} onChange={(e) => set({ from: e.target.value })} />
          <input type="date" aria-label="종료일" className="input" value={q.to} onChange={(e) => set({ to: e.target.value })} />
          <input className="input" placeholder="적요·거래처 검색" value={q.text} onChange={(e) => set({ text: e.target.value })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={q.unclassified} onChange={(e) => set({ unclassified: e.target.checked })} />미분류만</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={q.deleted} onChange={(e) => set({ deleted: e.target.checked })} />지운 것 보기</label>
        </div>
        {idx.unclassified.length > 0 && !q.unclassified && (
          <Banner tone="warn">항목에 연결하지 않은 집행이 {idx.unclassified.length}건 있어요. 잔액 계산에 들어가지 않아요. <button type="button" className="underline" onClick={() => set({ unclassified: true })}>보기</button></Banner>
        )}
        {flash}
        {rows.length === 0 ? <Empty>조건에 맞는 집행이 없어요.</Empty> : (
          <>
            <p className="text-sm text-stone-600">{formatNumber(rows.length)}건 · 합계 <Won n={sum} /></p>
            <div className="overflow-x-auto rounded border border-stone-200 bg-white">
              <table className="tbl">
                <thead><tr><th>날짜</th><th>항목</th><th>적요</th><th className="num">금액</th><th>출처</th><th>증빙</th><th /></tr></thead>
                <tbody>{shown.map((e) => <Row key={e.id} e={e} setFlash={setFlash} />)}</tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Button disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button>
                <span>{page + 1} / {pages}</span>
                <Button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>다음</Button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

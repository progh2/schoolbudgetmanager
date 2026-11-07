// 계획 변경·추경 (#18, #19): 변경안 목록 → 작성(전후 비교) → 제출 → 확정(승인 기록)·반려 → 시점 조회
import { useMemo, useState } from "react";
import { realCtx } from "../../domain/ctx";
import { formatNumber } from "../../domain/money";
import {
  allowedRevisionActions, amountsBefore, canCopy, copyRevision, createRevision, editRevision, REVISION_ACTION_LABEL,
  REVISION_KIND_LABEL, REVISION_STATUS_LABEL, transitionRevision, validateRevision, type RevisionAction,
} from "../../domain/revision";
import type { Revision, RevisionChange } from "../../schema/entities";
import { useFiscalYear, useStore } from "../../state/store";
import { History } from "../components/History";
import { Banner, Button, ConfirmBar, Empty, Field, MoneyInput, Section, Won, parseWonInput, useFlash } from "../components/ui";

type Target = RevisionChange["target"];
interface Line { target: Target; id: string; label: string; depth: number; now: number; spent?: number }

const STATUS_TONE: Record<Revision["status"], string> = {
  draft: "bg-sky-100 text-sky-900", in_review: "bg-amber-100 text-amber-900", confirmed: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-800", cancelled: "bg-stone-200 text-stone-600",
};

export function revisionTitle(r: Revision) {
  return r.status === "confirmed" ? `${r.seq}차 ${REVISION_KIND_LABEL[r.kind]}` : `${REVISION_KIND_LABEL[r.kind]} (${REVISION_STATUS_LABEL[r.status]})`;
}

function useLines(projectId: string): Line[] {
  const { data, idx } = useStore();
  return useMemo(() => {
    const p = idx.projects.get(projectId);
    if (!p) return [];
    const dept = new Map(data.departments.map((d) => [d.id, d.name]));
    const out: Line[] = [{ target: "project", id: p.id, label: "사업 총액", depth: 0, now: p.total }];
    for (const a of idx.allocationsByProject.get(p.id) ?? []) {
      out.push({ target: "allocation", id: a.id, label: dept.get(a.departmentId) ?? "부서", depth: 1, now: a.amount });
      for (const it of idx.itemsByAllocation.get(a.id) ?? [])
        out.push({ target: "item", id: it.id, label: it.name, depth: 2, now: it.limit, spent: idx.spentByItem.get(it.id) ?? 0 });
    }
    return out;
  }, [data, idx, projectId]);
}

function Editor({ rev, onClose }: { rev: Revision; onClose(): void }) {
  const { data, run } = useStore();
  const lines = useLines(rev.projectId);
  const project = data.projects.find((p) => p.id === rev.projectId);
  const { flash, setFlash } = useFlash();
  const key = (t: Target, id: string) => `${t}:${id}`;
  const changeOf = new Map(rev.changes.map((c) => [key(c.target, c.targetId), c]));
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [key(l.target, l.id), formatNumber(changeOf.get(key(l.target, l.id))?.after ?? l.now)])));
  const [reason, setReason] = useState(rev.reason);
  const [asking, setAsking] = useState<RevisionAction | null>(null);
  const [approval, setApproval] = useState({ approver: "", date: realCtx().today, note: "" });
  const [showBefore, setShowBefore] = useState(false);
  const editable = rev.status === "draft";

  // 작성 중이면 입력값으로, 아니면 저장된 변경으로 검증·비교한다
  const pending: RevisionChange[] = editable
    ? lines.flatMap((l) => {
      const v = parseWonInput(draft[key(l.target, l.id)] ?? "");
      return v !== null && v !== l.now ? [{ target: l.target, targetId: l.id, before: l.now, after: v }] : [];
    })
    : rev.changes;
  const problems = validateRevision(data, { projectId: rev.projectId, kind: rev.kind, changes: pending });
  const totalDelta = pending.filter((c) => c.target === "project").reduce((s, c) => s + c.after - c.before, 0);
  const before = showBefore && rev.status === "confirmed" ? amountsBefore(data, rev.id) : null;

  async function save(): Promise<boolean> {
    const r = await run(editRevision, { id: rev.id, reason, changes: pending.map((c) => ({ target: c.target, targetId: c.targetId, after: c.after })) });
    if (!r.ok) { setFlash({ tone: "error", text: r.message }); return false; }
    setFlash({ tone: "ok", text: "저장했어요." });
    return true;
  }
  async function act(action: RevisionAction, why = "") {
    if (action === "submit" && !(await save())) return;
    const r = await run(transitionRevision, { id: rev.id, action, reason: why, approval: action === "confirm" ? approval : undefined });
    setAsking(null);
    setFlash(r.ok ? { tone: "ok", text: `${REVISION_ACTION_LABEL[action]}했어요.` } : { tone: "error", text: r.message });
  }
  async function copy() {
    const r = await run(copyRevision, { id: rev.id });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    location.hash = `#/revisions/${r.id}`;
  }

  return (
    <div className="space-y-4 rounded border border-emerald-300 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{project?.name} · {revisionTitle(rev)}</h2>
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[rev.status]}`}>{REVISION_STATUS_LABEL[rev.status]}</span>
        {rev.copiedFrom && <span className="text-xs text-stone-500">반려된 변경안을 복사함</span>}
        <span className="flex-1" />
        <Button onClick={onClose}>닫기</Button>
      </div>
      {editable
        ? <Field label="변경 사유"><input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 2차 추경 교육청 교부액 증액(공문 ○○호)" /></Field>
        : <p className="text-sm">사유: {rev.reason || "—"}</p>}
      {rev.status === "rejected" && <Banner tone="error">반려 사유: {rev.rejectReason}. '복사해서 다시 작성'으로 고쳐 다시 낼 수 있어요.</Banner>}
      {rev.approval && <p className="text-sm text-stone-600">승인: {rev.approval.approver} · {rev.approval.date}{rev.approval.note && ` · ${rev.approval.note}`}</p>}

      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            <th>대상</th>
            {before && <th className="num">확정 직전</th>}
            <th className="num">{editable ? "지금" : "전"}</th><th className="num">후</th><th className="num">차이</th><th className="num">집행</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => {
              const k = key(l.target, l.id);
              const c = pending.find((x) => x.target === l.target && x.targetId === l.id);
              const after = c?.after ?? l.now;
              const lockedTotal = l.target === "project" && rev.kind === "plan_change";
              return (
                <tr key={k} className={c ? "bg-amber-50/60" : ""}>
                  <td style={{ paddingLeft: 8 + l.depth * 20 }} className={l.depth === 0 ? "font-semibold" : l.depth === 1 ? "font-medium" : ""}>{l.label}</td>
                  {before && <td className="num"><Won n={before.get(k) ?? l.now} /></td>}
                  <td className="num"><Won n={c?.before ?? l.now} /></td>
                  <td className="num">
                    {editable && !lockedTotal
                      ? <MoneyInput aria-label={`${l.label} 변경 후`} value={draft[k] ?? ""} onChange={(v) => setDraft({ ...draft, [k]: v })} />
                      : <Won n={after} />}
                  </td>
                  <td className="num">{c ? <span className={c.after > c.before ? "text-emerald-800" : "text-red-700"}>{c.after > c.before ? "+" : ""}<Won n={c.after - c.before} /></span> : "—"}</td>
                  <td className="num">{l.spent !== undefined ? <Won n={l.spent} /> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rev.kind === "supplementary" && <p className="text-sm">총액 변화: <Won n={totalDelta} /></p>}
      {(editable || rev.status === "in_review") && (problems.length > 0
        ? <Banner tone="warn"><ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Banner>
        : <Banner tone="ok">검증 통과: {pending.length}곳이 바뀌어요.</Banner>)}
      {flash}

      <div className="flex flex-wrap gap-2">
        {editable && <Button onClick={save}>저장</Button>}
        {allowedRevisionActions(rev.status).map((a) => (
          <Button key={a} kind={a === "confirm" || a === "submit" ? "primary" : a === "reject" || a === "cancel" ? "danger" : "default"}
            disabled={(a === "submit" || a === "confirm") && problems.length > 0}
            onClick={() => (a === "submit" || a === "withdraw" ? act(a) : setAsking(a))}>{REVISION_ACTION_LABEL[a]}</Button>
        ))}
        {canCopy(rev.status) && <Button kind="primary" onClick={copy}>복사해서 다시 작성</Button>}
        {rev.status === "confirmed" && <Button onClick={() => setShowBefore(!showBefore)}>{showBefore ? "확정 직전 숨기기" : "확정 직전 숫자 보기"}</Button>}
      </div>
      {asking === "confirm" && (
        <div className="flex flex-wrap items-end gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <span className="w-full">확정하면 바로 운영 숫자에 반영되고 되돌리지 않아요(바로잡으려면 반대 방향 변경안을 내요). 누가 승인했는지 남겨 주세요.</span>
          <Field label="승인자"><input autoFocus className="input" value={approval.approver} onChange={(e) => setApproval({ ...approval, approver: e.target.value })} placeholder="예: 학교장" /></Field>
          <Field label="승인일"><input type="date" className="input" value={approval.date} onChange={(e) => setApproval({ ...approval, date: e.target.value })} /></Field>
          <Field label="근거(선택)"><input className="input w-64" value={approval.note} onChange={(e) => setApproval({ ...approval, note: e.target.value })} placeholder="예: 운영위원회 심의, 공문 번호" /></Field>
          <Button kind="primary" disabled={!approval.approver.trim()} onClick={() => act("confirm")}>확정</Button>
          <Button onClick={() => setAsking(null)}>취소</Button>
        </div>
      )}
      {(asking === "reject" || asking === "cancel") && (
        <ConfirmBar message={asking === "reject" ? "반려할까요? 운영 숫자는 그대로예요." : "이 변경안을 취소할까요?"}
          needReason={asking === "reject" ? "반려 사유" : undefined} confirmLabel={REVISION_ACTION_LABEL[asking]}
          onConfirm={(why) => act(asking, why)} onCancel={() => setAsking(null)} />
      )}
      <History entityIds={[rev.id]} />
    </div>
  );
}

function NewRevision() {
  const { data, run } = useStore();
  const fy = useFiscalYear();
  const operating = data.projects.filter((p) => !p.deletedAt && p.fiscalYearId === fy?.id && p.status === "operating");
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<Revision["kind"]>("plan_change");
  const { flash, setFlash } = useFlash();
  if (operating.length === 0) return <Empty>운영 중인 사업이 없어요. 계획 단계 사업은 사업 화면에서 금액을 바로 고치고, 운영을 시작한 뒤의 변경만 여기서 해요.</Empty>;
  async function create() {
    const r = await run(createRevision, { projectId, kind, reason: "" });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    location.hash = `#/revisions/${r.id}`;
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-stone-200 bg-white p-3">
      <Field label="사업">
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">사업 고르기</option>
          {operating.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <fieldset className="flex gap-3 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "plan_change"} onChange={() => setKind("plan_change")} />계획 변경(총액 그대로)</label>
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "supplementary"} onChange={() => setKind("supplementary")} />추경(총액 증감)</label>
      </fieldset>
      <Button kind="primary" disabled={!projectId} onClick={create}>변경안 만들기</Button>
      {flash && <div className="w-full">{flash}</div>}
    </div>
  );
}

export function Revisions({ openId }: { openId?: string }) {
  const { data } = useStore();
  const fy = useFiscalYear();
  const projects = new Map(data.projects.filter((p) => p.fiscalYearId === fy?.id).map((p) => [p.id, p]));
  const list = data.revisions.filter((r) => projects.has(r.projectId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = openId ? data.revisions.find((r) => r.id === openId) : undefined;

  return (
    <div className="space-y-6">
      {open && <Editor key={open.id} rev={open} onClose={() => (location.hash = "#/revisions")} />}
      <Section title="새 변경안"><NewRevision /></Section>
      <Section title="변경안 목록">
        {list.length === 0 ? <Empty>아직 변경안이 없어요.</Empty> : (
          <div className="overflow-x-auto rounded border border-stone-200 bg-white">
            <table className="tbl">
              <thead><tr><th>만든 때</th><th>사업</th><th>변경안</th><th>상태</th><th>사유</th><th className="num">총액 변화</th><th className="num">바뀌는 곳</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const delta = r.changes.filter((c) => c.target === "project").reduce((s, c) => s + c.after - c.before, 0);
                  return (
                    <tr key={r.id} className={`cursor-pointer hover:bg-stone-50 ${r.id === openId ? "bg-emerald-50" : ""}`} onClick={() => (location.hash = `#/revisions/${r.id}`)}>
                      <td className="whitespace-nowrap">{r.createdAt.slice(0, 10)}</td>
                      <td>{projects.get(r.projectId)?.name}</td>
                      <td>{revisionTitle(r)}</td>
                      <td><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{REVISION_STATUS_LABEL[r.status]}</span></td>
                      <td>{r.reason}</td>
                      <td className="num">{delta ? <Won n={delta} /> : "—"}</td>
                      <td className="num">{r.changes.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

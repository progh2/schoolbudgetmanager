import { useEffect, useState } from "react";
import { allocationSummary, itemSummary, projectSummary } from "../../domain/balance";
import {
  changeProjectStatus, deleteAllocation, deleteItem, saveAllocation, saveItem, saveProject, setRegulationFiles,
} from "../../domain/commands";
import { evidenceTypeLabel } from "../../domain/evidence";
import { actionNeedsReason, allowedProjectActions, PROJECT_ACTION_LABEL, type ProjectAction } from "../../domain/project";
import { formatNumber } from "../../domain/money";
import { EVIDENCE_TYPES, type Allocation, type BudgetItem, type EvidenceType, type Project } from "../../schema/entities";
import { useStore } from "../../state/store";
import { History } from "../components/History";
import { RegulationSearch } from "../components/RegulationSearch";
import { Banner, Button, ConfirmBar, Empty, Field, MoneyInput, Rate, Section, Won, download, parseWonInput, useFlash } from "../components/ui";
import { StatusChip } from "./Projects";

type Flash = ReturnType<typeof useFlash>["setFlash"];

function ProjectHeader({ p, setFlash }: { p: Project; setFlash: Flash }) {
  const { data, idx, run } = useStore();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(p.name);
  const [total, setTotal] = useState(formatNumber(p.total));
  const [memo, setMemo] = useState(p.memo);
  const [owner, setOwner] = useState(p.ownerDepartmentId ?? "");
  const [asking, setAsking] = useState<ProjectAction | null>(null);
  const s = projectSummary(idx, p);

  async function save() {
    const t = parseWonInput(total);
    if (t === null) return setFlash({ tone: "error", text: "총액을 원 단위 숫자로 적어 주세요." });
    const r = await run(saveProject, { id: p.id, fiscalYearId: p.fiscalYearId, name, ownerDepartmentId: owner || null, total: t, memo });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash(null);
    setEdit(false);
  }

  async function transition(action: ProjectAction, reason: string) {
    const r = await run(changeProjectStatus, { id: p.id, action, reason });
    setAsking(null);
    if (!r.ok) setFlash({ tone: "error", text: r.message });
  }

  const statusHint = {
    planning: "계획 단계: 배정과 항목을 자유롭게 고칠 수 있어요. 다 정했으면 '운영 시작'을 누르세요.",
    operating: "운영 중: 금액은 잠겨 있어요. 바꾸려면 변경안(계획 변경·추경)을 만드세요.",
    closed: "마감: 읽기만 할 수 있어요. 고칠 일이 생기면 '다시 열기'(사유 기록).",
  }[p.status];

  return (
    <div className="space-y-3 rounded border border-stone-200 bg-white p-4">
      {edit ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="사업 이름"><input className="input w-56" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="총액(원)"><MoneyInput value={total} onChange={setTotal} disabled={p.status !== "planning"} /></Field>
          <Field label="주관 부서">
            <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">(없음)</option>
              {data.departments.filter((d) => !d.deletedAt).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="메모"><input className="input w-72" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
          <Button kind="primary" onClick={save}>저장</Button>
          <Button onClick={() => setEdit(false)}>취소</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{p.name}</h1>
          <StatusChip status={p.status} />
          {p.memo && <span className="text-sm text-stone-500">{p.memo}</span>}
          <span className="flex-1" />
          {p.status !== "closed" && <Button onClick={() => setEdit(true)}>정보 고치기</Button>}
          {allowedProjectActions(p.status).map((a) => (
            <Button key={a} kind={a === "close" ? "danger" : "default"} onClick={() => setAsking(a)}>{PROJECT_ACTION_LABEL[a]}</Button>
          ))}
        </div>
      )}
      {asking && (
        <ConfirmBar
          message={`'${PROJECT_ACTION_LABEL[asking]}' 할까요?${asking === "start" ? " 운영 중에는 금액을 변경안으로만 바꿀 수 있어요." : ""}`}
          needReason={actionNeedsReason(asking) ? "다시 여는 이유" : undefined}
          confirmLabel={PROJECT_ACTION_LABEL[asking]}
          onConfirm={(reason) => transition(asking, reason)}
          onCancel={() => setAsking(null)}
        />
      )}
      <p className="text-xs text-stone-500">{statusHint}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
        <div><dt className="text-stone-500">총액</dt><dd><Won n={p.total} /></dd></div>
        <div><dt className="text-stone-500">배정</dt><dd><Won n={s.allocated} /></dd></div>
        <div><dt className="text-stone-500">미배정</dt><dd><Won n={s.unallocated} className={s.unallocated > 0 ? "text-amber-700" : ""} /></dd></div>
        <div><dt className="text-stone-500">집행</dt><dd><Won n={s.spent} /></dd></div>
        <div><dt className="text-stone-500">집행률(집행/총액)</dt><dd><Rate rate={s.rate} executed={s.executed} emptyLabel="총액 없음" /></dd></div>
      </dl>
    </div>
  );
}

function Regulations({ p }: { p: Project }) {
  const { run, saveFile, readFile } = useStore();
  const [names, setNames] = useState<Record<string, string>>({});

  async function add(files: FileList) {
    const ids: string[] = [];
    for (const f of Array.from(files)) {
      const id = crypto.randomUUID();
      await saveFile({ id, name: f.name, type: f.type, size: f.size, data: await f.arrayBuffer() });
      ids.push(id);
    }
    await run(setRegulationFiles, { projectId: p.id, fileIds: [...p.regulationFileIds, ...ids] });
  }
  async function open(id: string) {
    const f = await readFile(id);
    if (f) download(new Blob([f.data], { type: f.type }), f.name);
  }
  // 이름은 파일 저장소에 있으니 첨부가 바뀔 때마다 읽어 둔다
  const key = p.regulationFileIds.join(",");
  useEffect(() => {
    Promise.all(p.regulationFileIds.map(async (id) => [id, (await readFile(id))?.name ?? "(없는 파일)"] as const)).then((e) => setNames(Object.fromEntries(e)));
  }, [key]);

  return (
    <Section title="규정·지침 문서">
      {p.regulationFileIds.length === 0 ? <p className="text-sm text-stone-500">첨부한 규정이 없어요.</p> : (
        <ul className="list-disc pl-5 text-sm">
          {p.regulationFileIds.map((id) => (
            <li key={id}>
              <Button kind="ghost" onClick={() => open(id)}>{names[id] ?? "…"}</Button>
              <Button kind="ghost" className="text-stone-500" onClick={() => run(setRegulationFiles, { projectId: p.id, fileIds: p.regulationFileIds.filter((x) => x !== id) })}>떼기</Button>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-block cursor-pointer rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
        규정 문서 첨부…
        <input type="file" multiple className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
      </label>
      <RegulationSearch fileIds={p.regulationFileIds} />
    </Section>
  );
}

function EvidencePicker({ value, onChange }: { value: EvidenceType[]; onChange(v: EvidenceType[]): void }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {EVIDENCE_TYPES.map((t) => (
        <label key={t} className="flex items-center gap-1">
          <input type="checkbox" checked={value.includes(t)} onChange={(e) => onChange(e.target.checked ? [...value, t] : value.filter((x) => x !== t))} />
          {evidenceTypeLabel[t]}
        </label>
      ))}
    </div>
  );
}

function ItemRow({ it, locked, setFlash }: { it: BudgetItem; locked: boolean; setFlash: Flash }) {
  const { idx, run } = useStore();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ code: it.code, name: it.name, limit: formatNumber(it.limit), dueDate: it.dueDate ?? "", req: it.requiredEvidence });
  const [askDelete, setAskDelete] = useState(false);
  const s = itemSummary(idx, it);
  const p = idx.projects.get(idx.allocations.get(it.allocationId)?.projectId ?? "");

  async function save() {
    const limit = parseWonInput(f.limit);
    if (limit === null) return setFlash({ tone: "error", text: "한도를 숫자로 적어 주세요." });
    const r = await run(saveItem, { id: it.id, allocationId: it.allocationId, code: f.code, name: f.name, limit, dueDate: f.dueDate || null, requiredEvidence: f.req });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash(null);
    setEdit(false);
  }

  if (edit)
    return (
      <tr className="bg-emerald-50/40">
        <td><input className="input w-24" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></td>
        <td><input className="input w-40" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
        <td className="num"><MoneyInput value={f.limit} onChange={(v) => setF({ ...f, limit: v })} disabled={p?.status !== "planning"} /></td>
        <td colSpan={3}><EvidencePicker value={f.req} onChange={(req) => setF({ ...f, req })} /></td>
        <td><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></td>
        <td className="whitespace-nowrap"><Button kind="primary" onClick={save}>저장</Button> <Button onClick={() => setEdit(false)}>취소</Button></td>
      </tr>
    );
  return (
    <>
      <tr>
        <td className="text-stone-500">{it.code}</td>
        <td>{it.name}{it.requiredEvidence.length > 0 && <div className="text-xs text-stone-500">필수 증빙: {it.requiredEvidence.map((t) => evidenceTypeLabel[t]).join(", ")}</div>}</td>
        <td className="num"><Won n={it.limit} /></td>
        <td className="num"><Won n={s.spent} /></td>
        <td className="num"><Won n={s.remaining} /></td>
        <td className="num"><Rate rate={s.rate} executed={s.executed} emptyLabel="한도 0원" /></td>
        <td>{it.dueDate ?? "—"}</td>
        <td className="whitespace-nowrap">
          {!locked && <Button kind="ghost" onClick={() => setEdit(true)}>고치기</Button>}
          {p?.status === "planning" && <Button kind="ghost" className="text-red-700" onClick={() => setAskDelete(true)}>지우기</Button>}
        </td>
      </tr>
      {askDelete && (
        <tr><td colSpan={8}>
          <ConfirmBar message={`'${it.name}' 항목을 지울까요?`} needReason="지우는 이유" confirmLabel="지우기" onCancel={() => setAskDelete(false)}
            onConfirm={async (reason) => { const r = await run(deleteItem, { id: it.id, reason }); setAskDelete(false); if (!r.ok) setFlash({ tone: "error", text: r.message }); }} />
        </td></tr>
      )}
    </>
  );
}

function NewItem({ a, setFlash }: { a: Allocation; setFlash: Flash }) {
  const run = useStore((s) => s.run);
  const p = useStore((s) => s.idx.projects.get(a.projectId));
  const [f, setF] = useState({ code: "", name: "", limit: "", dueDate: "", req: [] as EvidenceType[] });
  async function add() {
    const limit = f.limit ? parseWonInput(f.limit) : 0;
    if (limit === null) return setFlash({ tone: "error", text: "한도를 숫자로 적어 주세요." });
    const r = await run(saveItem, { allocationId: a.id, code: f.code, name: f.name, limit, dueDate: f.dueDate || null, requiredEvidence: f.req });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash(null);
    setF({ code: "", name: "", limit: "", dueDate: "", req: [] });
  }
  return (
    <tr className="bg-stone-50">
      <td><input className="input w-24" placeholder="코드·과목" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></td>
      <td><input className="input w-40" placeholder="항목 이름" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td className="num"><MoneyInput placeholder={p?.status === "planning" ? "한도" : "0 (운영 중)"} disabled={p?.status !== "planning"} value={f.limit} onChange={(v) => setF({ ...f, limit: v })} /></td>
      <td colSpan={3}><EvidencePicker value={f.req} onChange={(req) => setF({ ...f, req })} /></td>
      <td><input type="date" aria-label="사용기한" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></td>
      <td><Button onClick={add} disabled={!f.name.trim()}>항목 추가</Button></td>
    </tr>
  );
}

function AllocationCard({ a, p, setFlash }: { a: Allocation; p: Project; setFlash: Flash }) {
  const { data, idx, run } = useStore();
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(formatNumber(a.amount));
  const [basis, setBasis] = useState(a.basis === null ? "" : String(a.basis));
  const [memo, setMemo] = useState(a.memo);
  const [askDelete, setAskDelete] = useState(false);
  const s = allocationSummary(idx, a);
  const items = (idx.itemsByAllocation.get(a.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, "ko"));
  const locked = p.status === "closed";
  const dept = data.departments.find((d) => d.id === a.departmentId)?.name ?? "(부서 없음)";

  async function save() {
    const amt = parseWonInput(amount);
    if (amt === null) return setFlash({ tone: "error", text: "배정액을 숫자로 적어 주세요." });
    const b = basis.trim() ? Number(basis.replace(/,/g, "")) : null;
    const r = await run(saveAllocation, { id: a.id, projectId: p.id, departmentId: a.departmentId, amount: amt, basis: b, memo });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash(null);
    setEdit(false);
  }

  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-3 py-2">
        <h3 className="font-semibold">{dept}</h3>
        {edit ? (
          <>
            <Field label="배정액"><MoneyInput value={amount} onChange={setAmount} disabled={p.status !== "planning"} /></Field>
            <Field label="기준값(선택)" hint="학생 수·학급 수 등"><input className="input w-24" value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
            <Field label="메모"><input className="input w-48" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <Button kind="primary" onClick={save}>저장</Button>
            <Button onClick={() => setEdit(false)}>취소</Button>
          </>
        ) : (
          <>
            <span className="text-sm">배정 <Won n={a.amount} /> · 집행 <Won n={s.spent} /> · 잔액 <Won n={s.remaining} /> · <Rate rate={s.rate} executed={s.executed} /></span>
            {a.basis !== null && <span className="text-xs text-stone-500">기준값 {formatNumber(a.basis)}</span>}
            {s.itemLimitSum < a.amount && <span className="text-xs text-amber-700">항목에 안 나눈 금액 <Won n={a.amount - s.itemLimitSum} /></span>}
            {a.memo && <span className="text-xs text-stone-500">{a.memo}</span>}
            <span className="flex-1" />
            {!locked && <Button kind="ghost" onClick={() => setEdit(true)}>고치기</Button>}
            {p.status === "planning" && <Button kind="ghost" className="text-red-700" onClick={() => setAskDelete(true)}>지우기</Button>}
          </>
        )}
      </div>
      {askDelete && (
        <div className="p-2">
          <ConfirmBar message={`${dept} 배정과 그 안의 항목을 지울까요?`} needReason="지우는 이유" confirmLabel="지우기" onCancel={() => setAskDelete(false)}
            onConfirm={async (reason) => { const r = await run(deleteAllocation, { id: a.id, reason }); setAskDelete(false); if (!r.ok) setFlash({ tone: "error", text: r.message }); }} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>코드</th><th>항목</th><th className="num">한도</th><th className="num">집행</th><th className="num">잔액</th><th className="num">집행률</th><th>사용기한</th><th /></tr></thead>
          <tbody>
            {items.map((it) => <ItemRow key={it.id} it={it} locked={locked} setFlash={setFlash} />)}
            {items.length === 0 && <tr><td colSpan={8} className="text-center text-stone-500">항목이 없어요. 에듀파인 목·세목 단위로 나눠 두면 업로드 매칭이 쉬워요.</td></tr>}
            {!locked && <NewItem a={a} setFlash={setFlash} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewAllocation({ p, setFlash }: { p: Project; setFlash: Flash }) {
  const { data, idx, run } = useStore();
  const used = new Set((idx.allocationsByProject.get(p.id) ?? []).map((a) => a.departmentId));
  const depts = data.departments.filter((d) => !d.deletedAt && d.active && !used.has(d.id));
  const [dept, setDept] = useState("");
  const [amount, setAmount] = useState("");
  if (p.status !== "planning" || depts.length === 0) return null;
  async function add() {
    const amt = parseWonInput(amount || "0");
    if (amt === null) return setFlash({ tone: "error", text: "배정액을 숫자로 적어 주세요." });
    const r = await run(saveAllocation, { projectId: p.id, departmentId: dept, amount: amt, basis: null, memo: "" });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash(null);
    setDept("");
    setAmount("");
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-dashed border-stone-300 p-3">
      <Field label="부서">
        <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">부서 고르기</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="배정액"><MoneyInput value={amount} onChange={setAmount} /></Field>
      <Button onClick={add} disabled={!dept}>배정 추가</Button>
    </div>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const { data, idx } = useStore();
  const { flash, setFlash } = useFlash();
  const p = data.projects.find((x) => x.id === id && !x.deletedAt);
  if (!p) return <Banner tone="error">사업을 찾지 못했어요. <a className="underline" href="#/projects">목록으로</a></Banner>;
  const allocs = (idx.allocationsByProject.get(p.id) ?? []).slice().sort((a, b) => {
    const order = (d: string) => data.departments.find((x) => x.id === d)?.order ?? 0;
    return order(a.departmentId) - order(b.departmentId);
  });

  return (
    <div className="space-y-6">
      <a href="#/projects" className="text-sm text-stone-500">← 목적사업</a>
      <ProjectHeader key={p.updatedAt} p={p} setFlash={setFlash} />
      {flash}
      <Section title="부서 배정과 예산 항목">
        {allocs.length === 0 && <Empty>아직 배정이 없어요. 아래에서 부서를 골라 배정하세요.</Empty>}
        {allocs.map((a) => <AllocationCard key={a.id} a={a} p={p} setFlash={setFlash} />)}
        <NewAllocation p={p} setFlash={setFlash} />
      </Section>
      <Regulations p={p} />
      <History entityIds={[p.id, ...allocs.map((a) => a.id), ...allocs.flatMap((a) => (idx.itemsByAllocation.get(a.id) ?? []).map((i) => i.id))]} />
    </div>
  );
}

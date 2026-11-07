import { useState } from "react";
import { projectSummary } from "../../domain/balance";
import { saveProject } from "../../domain/commands";
import { PROJECT_STATUS_LABEL } from "../../domain/project";
import { useFiscalYear, useStore } from "../../state/store";
import { Button, Empty, Field, MoneyInput, Rate, Section, Won, parseWonInput, useFlash } from "../components/ui";

export function StatusChip({ status }: { status: "planning" | "operating" | "closed" }) {
  const c = { planning: "bg-sky-100 text-sky-900", operating: "bg-emerald-100 text-emerald-900", closed: "bg-stone-200 text-stone-700" }[status];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${c}`}>{PROJECT_STATUS_LABEL[status]}</span>;
}

function NewProject({ onDone }: { onDone(): void }) {
  const { data, run } = useStore();
  const fy = useFiscalYear()!;
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [owner, setOwner] = useState("");
  const { flash, setFlash } = useFlash();
  const depts = data.departments.filter((d) => !d.deletedAt && d.active);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = parseWonInput(total);
    if (t === null) return setFlash({ tone: "error", text: "총액을 원 단위 숫자로 적어 주세요." });
    const r = await run(saveProject, { fiscalYearId: fy.id, name, ownerDepartmentId: owner || null, total: t, memo: "" });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    location.hash = `#/projects/${r.id}`;
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded border border-stone-200 bg-white p-3">
      <Field label="사업 이름"><input autoFocus className="input w-56" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 방과후학교 운영" /></Field>
      <Field label="총액(원)"><MoneyInput value={total} onChange={setTotal} placeholder="10,000,000" /></Field>
      <Field label="주관 부서">
        <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">(없음)</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Button kind="primary" type="submit" disabled={!name.trim() || !total}>만들기</Button>
      <Button onClick={onDone}>취소</Button>
      {flash && <div className="w-full">{flash}</div>}
    </form>
  );
}

export function Projects() {
  const { data, idx } = useStore();
  const fy = useFiscalYear();
  const [adding, setAdding] = useState(false);
  const projects = data.projects.filter((p) => !p.deletedAt && p.fiscalYearId === fy?.id).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const deptName = (id: string | null) => data.departments.find((d) => d.id === id)?.name ?? "";

  return (
    <Section title={`목적사업 (${fy?.label} 회계연도)`} actions={!adding && <Button kind="primary" onClick={() => setAdding(true)}>새 사업</Button>}>
      {adding && <NewProject onDone={() => setAdding(false)} />}
      {projects.length === 0 ? (
        <Empty>아직 사업이 없어요. '새 사업'으로 첫 목적사업을 등록하세요.</Empty>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="tbl">
            <thead><tr><th>사업</th><th>상태</th><th>주관</th><th className="num">총액</th><th className="num">미배정</th><th className="num">집행</th><th className="num">잔액</th><th className="num">집행률</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const s = projectSummary(idx, p);
                return (
                  <tr key={p.id} className="hover:bg-stone-50">
                    <td><a className="text-emerald-900 underline" href={`#/projects/${p.id}`}>{p.name}</a></td>
                    <td><StatusChip status={p.status} /></td>
                    <td>{deptName(p.ownerDepartmentId)}</td>
                    <td className="num"><Won n={p.total} /></td>
                    <td className="num">{s.unallocated === 0 ? "—" : <Won n={s.unallocated} />}</td>
                    <td className="num"><Won n={s.spent} /></td>
                    <td className="num"><Won n={s.remaining} /></td>
                    <td className="num"><Rate rate={s.rate} executed={s.executed} emptyLabel="총액 없음" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

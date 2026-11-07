// 증빙 준비 목록 + 집행별 증빙 첨부·검토 (#12, #13)
import { useMemo, useState } from "react";
import {
  addEvidence, changeEvidenceType, deleteEvidence, evidenceChecklist, evidenceStateLabel, evidenceTypeLabel,
  isEvidenceLacking, LARGE_FILE, restoreEvidence, reviewEvidence, type EvidenceState,
} from "../../domain/evidence";
import { realCtx } from "../../domain/ctx";
import { formatNumber } from "../../domain/money";
import { XLSX_MIME } from "../../export/mime";
import { EVIDENCE_TYPES, type EvidenceType } from "../../schema/entities";
import { useFiscalYear, useStore } from "../../state/store";
import { itemOptions } from "../itemOptions";
import { Banner, Button, ConfirmBar, Empty, Section, Won, download, useFlash } from "../components/ui";

const REVIEW_LABEL = { pending: "검토 전", ok: "확인", needs_fix: "보완 필요" } as const;
const STATE_TONE: Record<EvidenceState, string> = {
  none: "bg-red-100 text-red-800", partial: "bg-amber-100 text-amber-900", complete: "bg-emerald-100 text-emerald-900", not_required: "bg-stone-100 text-stone-600",
};

function Detail({ executionId, onClose }: { executionId: string; onClose(): void }) {
  const { data, idx, run, saveFile, readFile } = useStore();
  const fy = useFiscalYear();
  const { flash, setFlash } = useFlash();
  const [type, setType] = useState<EvidenceType>("resolution");
  const [ask, setAsk] = useState<{ id: string; kind: "delete" | "fix" } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const e = data.executions.find((x) => x.id === executionId);
  if (!e) return null;
  const label = e.itemId ? itemOptions(data, idx, fy?.id, true).find((o) => o.id === e.itemId)?.label : "(미분류)";
  const item = e.itemId ? idx.items.get(e.itemId) : undefined;
  const list = data.evidences.filter((x) => x.executionId === e.id && (showDeleted || !x.deletedAt));

  async function attach(fileList: FileList) {
    // 파일 선택칸을 비우면 FileList도 비므로 먼저 배열로 복사한다
    const files = Array.from(fileList);
    const big = files.filter((f) => f.size > LARGE_FILE);
    for (const f of files) {
      const fileId = crypto.randomUUID();
      await saveFile({ id: fileId, name: f.name, type: f.type, size: f.size, data: await f.arrayBuffer() });
      const r = await run(addEvidence, { executionId: e!.id, type, fileId, fileName: f.name });
      if (!r.ok) return setFlash({ tone: "error", text: r.message });
    }
    setFlash(big.length
      ? { tone: "warn", text: `붙였어요. ${big.map((f) => f.name).join(", ")}은 50MB가 넘어요. 브라우저 저장 공간과 백업 파일이 커져요.` }
      : { tone: "ok", text: `${files.length}개를 ${evidenceTypeLabel[type]}로 붙였어요.` });
  }
  async function open(fileId: string) {
    const f = await readFile(fileId);
    if (!f) return setFlash({ tone: "error", text: "파일을 찾지 못했어요. 백업에서 빠졌을 수 있어요." });
    download(new Blob([f.data], { type: f.type }), f.name);
  }

  return (
    <div className="space-y-3 rounded border border-emerald-300 bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-semibold">{e.date} · <Won n={e.amount} /> · {e.summary}</div>
          <div className="text-sm text-stone-600">{label}</div>
          {item && <div className="text-xs text-stone-500">필수 증빙: {item.requiredEvidence.length ? item.requiredEvidence.map((t) => evidenceTypeLabel[t]).join(", ") : "없음 (항목 설정에서 정해요)"}</div>}
        </div>
        <Button onClick={onClose}>닫기</Button>
      </div>
      <div
        className="flex flex-wrap items-center gap-2 rounded border-2 border-dashed border-stone-300 p-3 text-sm"
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => { ev.preventDefault(); if (ev.dataTransfer.files.length) attach(ev.dataTransfer.files); }}
      >
        <select aria-label="증빙 유형" className="input" value={type} onChange={(ev) => setType(ev.target.value as EvidenceType)}>
          {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{evidenceTypeLabel[t]}</option>)}
        </select>
        <label className="cursor-pointer rounded bg-emerald-800 px-3 py-1.5 text-white">
          파일 붙이기…
          <input type="file" multiple className="hidden" onChange={(ev) => { if (ev.target.files?.length) attach(ev.target.files); ev.target.value = ""; }} />
        </label>
        <span className="text-stone-500">또는 여기로 끌어 놓기</span>
      </div>
      {flash}
      {list.length === 0 ? <p className="text-sm text-stone-500">붙인 증빙이 없어요.</p> : (
        <table className="tbl">
          <thead><tr><th>유형</th><th>파일</th><th>검토</th><th /></tr></thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className={v.deletedAt ? "text-stone-400 line-through" : ""}>
                <td>
                  <select aria-label="유형" className="input" value={v.type} disabled={!!v.deletedAt} onChange={(ev) => run(changeEvidenceType, { id: v.id, type: ev.target.value as EvidenceType })}>
                    {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{evidenceTypeLabel[t]}</option>)}
                  </select>
                </td>
                <td><Button kind="ghost" onClick={() => open(v.fileId)}>{v.fileName}</Button></td>
                <td>
                  <span className={v.review === "needs_fix" ? "text-red-700" : v.review === "ok" ? "text-emerald-800" : "text-stone-600"}>{REVIEW_LABEL[v.review]}</span>
                  {v.reviewNote && <div className="text-xs text-stone-500">{v.reviewNote}</div>}
                </td>
                <td className="whitespace-nowrap">
                  {v.deletedAt ? <Button kind="ghost" onClick={() => run(restoreEvidence, { id: v.id })}>되돌리기</Button> : <>
                    {v.review !== "ok" && <Button kind="ghost" onClick={() => run(reviewEvidence, { id: v.id, review: "ok", note: "" })}>확인</Button>}
                    {v.review !== "needs_fix" && <Button kind="ghost" className="text-amber-700" onClick={() => setAsk({ id: v.id, kind: "fix" })}>보완 필요</Button>}
                    {v.review !== "pending" && <Button kind="ghost" className="text-stone-500" onClick={() => run(reviewEvidence, { id: v.id, review: "pending", note: "" })}>검토 전으로</Button>}
                    <Button kind="ghost" className="text-red-700" onClick={() => setAsk({ id: v.id, kind: "delete" })}>지우기</Button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label className="flex items-center gap-1 text-xs text-stone-500"><input type="checkbox" checked={showDeleted} onChange={(ev) => setShowDeleted(ev.target.checked)} />지운 증빙 보기</label>
      {ask && (
        <ConfirmBar
          message={ask.kind === "fix" ? "무엇을 보완해야 하나요? 같은 유형의 새 파일을 붙이면 다시 갖춘 것으로 봐요." : "이 증빙을 지울까요? 파일은 남겨 두어 되돌릴 수 있어요."}
          needReason={ask.kind === "fix" ? "보완할 내용" : "지우는 이유"}
          confirmLabel={ask.kind === "fix" ? "보완 필요로" : "지우기"}
          onCancel={() => setAsk(null)}
          onConfirm={async (reason) => {
            const r = ask.kind === "fix" ? await run(reviewEvidence, { id: ask.id, review: "needs_fix", note: reason }) : await run(deleteEvidence, { id: ask.id, reason });
            setAsk(null);
            if (!r.ok) setFlash({ tone: "error", text: r.message });
          }}
        />
      )}
    </div>
  );
}

type Filter = "lacking" | "needs_fix" | "complete" | "all";

export function EvidenceScreen() {
  const { data, idx } = useStore();
  const fy = useFiscalYear();
  const initial = new URLSearchParams(location.hash.split("?")[1] ?? "").get("e");
  const [open, setOpen] = useState<string | null>(initial);
  const [filter, setFilter] = useState<Filter>(initial ? "all" : "lacking");
  const [dept, setDept] = useState("");
  const [project, setProject] = useState("");
  const list = useMemo(() => (fy ? evidenceChecklist(data, fy) : []), [data, fy]);
  const exec = useMemo(() => new Map(data.executions.map((e) => [e.id, e])), [data.executions]);
  const deptName = new Map(data.departments.map((d) => [d.id, d.name]));

  const where = (r: (typeof list)[number]) => {
    const it = r.itemId ? idx.items.get(r.itemId) : undefined;
    const a = it && idx.allocations.get(it.allocationId);
    return { a, p: a && idx.projects.get(a.projectId), it };
  };
  const rows = list.filter((r) => {
    const j = r.judgement;
    if (filter === "lacking" && !isEvidenceLacking(j)) return false;
    if (filter === "needs_fix" && !j.needsFix) return false;
    if (filter === "complete" && j.state !== "complete") return false;
    const { a } = where(r);
    if (dept && a?.departmentId !== dept) return false;
    if (project && a?.projectId !== project) return false;
    return true;
  }).sort((x, y) => (exec.get(y.executionId)?.date ?? "").localeCompare(exec.get(x.executionId)?.date ?? ""));
  const lacking = list.filter((r) => isEvidenceLacking(r.judgement)).length;

  async function exportXlsx() {
    if (!fy) return;
    const { exportEvidenceChecklist } = await import("../../export/evidence");
    const ctx = realCtx();
    download(exportEvidenceChecklist(data, fy, ctx.now, filter === "lacking"), `증빙준비목록-${fy.label}-${ctx.today}.xlsx`, XLSX_MIME);
  }

  return (
    <div className="space-y-6">
      {open && <Detail key={open} executionId={open} onClose={() => { setOpen(null); history.replaceState(null, "", "#/evidence"); }} />}
      <Section title="증빙 준비 목록" actions={<Button onClick={exportXlsx}>엑셀로 내보내기</Button>}>
        <p className="text-sm text-stone-600">
          {fy?.label} 회계연도 집행 {formatNumber(list.length)}건 중 증빙이 없거나 일부만 있거나 보완이 필요한 건 <b>{formatNumber(lacking)}건</b>.
          필수 증빙은 예산 항목마다 정해요.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {([["lacking", "미비"], ["needs_fix", "보완 필요"], ["complete", "완비"], ["all", "전체"]] as [Filter, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded px-3 py-1 ${filter === k ? "bg-emerald-800 text-white" : "border border-stone-300 bg-white"}`}>{l}</button>
          ))}
          <select aria-label="사업" className="input" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">모든 사업</option>
            {[...idx.projects.values()].filter((p) => p.fiscalYearId === fy?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="부서" className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">모든 부서</option>
            {data.departments.filter((d) => !d.deletedAt).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {list.length === 0 ? <Empty>아직 집행이 없어요.</Empty> : rows.length === 0 ? <Banner tone="ok">조건에 맞는 건이 없어요.</Banner> : (
          <div className="overflow-x-auto rounded border border-stone-200 bg-white">
            <table className="tbl">
              <thead><tr><th>날짜</th><th>사업 · 부서 · 항목</th><th>적요</th><th className="num">금액</th><th>증빙</th><th>빠진 서류</th></tr></thead>
              <tbody>
                {rows.slice(0, 500).map((r) => {
                  const e = exec.get(r.executionId)!;
                  const { a, p, it } = where(r);
                  const j = r.judgement;
                  return (
                    <tr key={r.executionId} className={`cursor-pointer hover:bg-stone-50 ${open === r.executionId ? "bg-emerald-50" : ""}`} onClick={() => setOpen(r.executionId)}>
                      <td className="whitespace-nowrap">{e.date}</td>
                      <td>{p ? `${p.name} · ${deptName.get(a!.departmentId) ?? ""} · ${it!.name}` : <span className="text-amber-700">미분류</span>}</td>
                      <td>{e.summary}</td>
                      <td className="num"><Won n={e.amount} /></td>
                      <td><span className={`rounded px-1.5 py-0.5 text-xs ${STATE_TONE[j.state]}`}>{evidenceStateLabel[j.state]}{j.count ? ` ${j.count}` : ""}</span>{j.needsFix && <span className="ml-1 text-xs text-red-700">보완 필요</span>}</td>
                      <td className="text-xs">{j.missing.map((t) => evidenceTypeLabel[t]).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 500 && <p className="text-xs text-stone-500">처음 500건만 보여 줘요. 부서·사업으로 좁히거나 엑셀로 내보내세요.</p>}
      </Section>
    </div>
  );
}

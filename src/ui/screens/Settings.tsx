import { useEffect, useState } from "react";
import { backupFileName, buildBackup, parseBackup, type BackupSummary } from "../../backup/bundle";
import { createFiscalYear, defaultFiscalYear, saveDepartment } from "../../domain/commands";
import { realCtx } from "../../domain/ctx";
import { formatNumber } from "../../domain/money";
import type { Data, StoredFile } from "../../schema/entities";
import { useStore } from "../../state/store";
import { AutoBackup } from "../components/AutoBackup";
import { Banner, Button, ConfirmBar, Section, Won, download, useFlash } from "../components/ui";

const APP_VERSION = "0.1.0";

export async function exportNow(): Promise<{ bytes: Uint8Array; name: string }> {
  const s = useStore.getState();
  const ctx = realCtx();
  const bytes = buildBackup(s.data, await s.allFiles(), ctx.now, APP_VERSION);
  s.setMeta({ lastBackupAt: ctx.now });
  return { bytes, name: backupFileName(ctx.today) };
}

function BackupPanel() {
  const { replaceAll, meta } = useStore();
  const { flash, setFlash } = useFlash();
  const [pending, setPending] = useState<{ data: Data; files: StoredFile[]; summary: BackupSummary; name: string } | null>(null);

  async function doExport() {
    const { bytes, name } = await exportNow();
    download(bytes, name, "application/zip");
    setFlash({ tone: "ok", text: `${name}을 내려받았어요. USB나 학교 드라이브 같은 다른 곳에도 보관해 주세요.` });
  }

  async function pick(file: File) {
    const r = parseBackup(new Uint8Array(await file.arrayBuffer()));
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setPending({ data: r.data, files: r.files, summary: r.summary, name: file.name });
  }

  async function confirmImport() {
    if (!pending) return;
    // 지금 데이터를 먼저 내려받아 둔다 — 잘못 가져와도 돌아갈 길이 있게
    const { bytes, name } = await exportNow();
    download(bytes, name.replace(".yesan.zip", "-가져오기전.yesan.zip"), "application/zip");
    await replaceAll(pending.data, pending.files);
    setPending(null);
    setFlash({ tone: "ok", text: "백업을 가져왔어요. 가져오기 전 자료는 '-가져오기전' 파일로 내려받아 두었어요." });
  }

  const c = pending?.summary.counts;
  return (
    <Section title="백업">
      <p className="text-sm text-stone-600">
        데이터는 이 브라우저에만 있어요. 다른 PC로 옮기거나 브라우저 자료가 지워질 때를 대비해 백업 파일(.yesan.zip, 증빙 파일 포함)을 내려받아 두세요.
        {meta.lastBackupAt && <> 마지막 백업: {meta.lastBackupAt.slice(0, 16).replace("T", " ")} (UTC)</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button kind="primary" onClick={doExport}>백업 내려받기</Button>
        <label className="cursor-pointer rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
          백업 가져오기…
          <input type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        </label>
      </div>
      {flash}
      {pending && c && (
        <ConfirmBar
          message={<>
            <b>{pending.name}</b> ({pending.summary.exportedAt.slice(0, 10)} 내보냄): 사업 {c.projects}개, 배정 {c.allocations}건, 집행 {formatNumber(c.executions)}건
            (합계 <Won n={pending.summary.executionSum} />), 증빙 파일 {pending.summary.files}개. <b>지금 데이터를 모두 이것으로 바꿔요.</b>
          </>}
          confirmLabel="바꾸기"
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      )}
      <AutoBackup />
    </Section>
  );
}

function StoragePanel() {
  const persisted = useStore((s) => s.persisted);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB 사용${e.quota ? ` / 약 ${(e.quota / 1024 / 1024 / 1024).toFixed(0)} GB 가능` : ""}`);
    });
  }, []);
  return (
    <Section title="저장 공간">
      <ul className="list-disc pl-5 text-sm text-stone-700">
        <li>저장 공간 유지: {persisted === true ? "허락됨 (브라우저가 임의로 지우지 않아요)" : persisted === false ? "허락 안 됨 — 백업을 자주 해 주세요" : "이 브라우저는 지원하지 않아요"}</li>
        {usage && <li>{usage}</li>}
        <li>주소마다 저장소가 따로예요. GitHub Pages 주소와 Pod 주소의 데이터는 서로 보이지 않으니 백업 파일로 옮겨 주세요.</li>
      </ul>
    </Section>
  );
}

function YearsAndDepartments() {
  const { data, run, setMeta } = useStore();
  const { flash, setFlash } = useFlash();
  const [newYear, setNewYear] = useState("");
  const [newDept, setNewDept] = useState("");
  const years = data.fiscalYears.filter((f) => !f.deletedAt).sort((a, b) => b.start.localeCompare(a.start));
  const depts = data.departments.filter((d) => !d.deletedAt).sort((a, b) => a.order - b.order);

  async function addYear() {
    const r = await run(createFiscalYear, defaultFiscalYear(Number(newYear)));
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setMeta({ fiscalYearId: r.id ?? null });
    setNewYear("");
  }
  async function addDept() {
    const r = await run(saveDepartment, { name: newDept });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setNewDept("");
  }
  async function rename(id: string, name: string) {
    const r = await run(saveDepartment, { id, name });
    if (!r.ok) setFlash({ tone: "error", text: r.message });
  }

  return (
    <>
      <Section title="회계연도">
        <ul className="text-sm">{years.map((y) => <li key={y.id}>{y.label} ({y.start} ~ {y.end})</li>)}</ul>
        <div className="flex gap-2">
          <input className="input w-28" placeholder="예: 2027" value={newYear} onChange={(e) => setNewYear(e.target.value)} />
          <Button onClick={addYear} disabled={!/^\d{4}$/.test(newYear)}>회계연도 추가</Button>
        </div>
      </Section>
      <Section title="부서">
        <table className="tbl max-w-lg">
          <thead><tr><th>이름</th><th>사용</th></tr></thead>
          <tbody>
            {depts.map((d) => (
              <tr key={d.id}>
                <td><input aria-label="부서 이름" className="input w-full" defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && rename(d.id, e.target.value)} /></td>
                <td><input type="checkbox" aria-label="사용" checked={d.active} onChange={(e) => run(saveDepartment, { id: d.id, name: d.name, active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <input className="input w-48" placeholder="새 부서" value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDept()} />
          <Button onClick={addDept} disabled={!newDept.trim()}>부서 추가</Button>
        </div>
        <p className="text-xs text-stone-500">쓰지 않는 부서는 지우지 말고 '사용'을 끄세요. 지난 배정 기록이 그 부서를 가리키고 있어요.</p>
      </Section>
      {flash}
    </>
  );
}

export function Settings() {
  const hasYear = useStore((s) => s.data.fiscalYears.length > 0);
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-bold">설정·백업</h1>
      {!hasYear && <Banner>백업 파일이 있으면 아래에서 가져오세요. 처음이면 <a className="underline" href="#/">시작 화면</a>으로.</Banner>}
      <BackupPanel />
      <StoragePanel />
      {hasYear && <YearsAndDepartments />}
    </div>
  );
}

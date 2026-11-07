// 에듀파인 업로드: 파일 → 시트·머리글 → 열 매핑 → 미리보기(수동 매칭) → 반영. 아래에 업로드 이력과 되돌리기.
import { useMemo, useState } from "react";
import { formatNumber } from "../../domain/money";
import { applyUpload, revertUpload, saveMappingProfile } from "../../domain/upload";
import type { Plan, PlanRow, RowStatus } from "../../import/plan";
import type { Sheet } from "../../import/read";
import { MAPPING_FIELDS, type MappingField, type MatchRule } from "../../schema/entities";
import { useFiscalYear, useStore } from "../../state/store";
import { itemOptions } from "../itemOptions";
import { Banner, Button, ConfirmBar, Empty, Section, Won, useFlash } from "../components/ui";

// SheetJS를 품은 모듈은 이 화면에서만 필요하다 — 처음 쓸 때 불러온다
const loadImport = () => Promise.all([import("../../import/read"), import("../../import/header"), import("../../import/mapping"), import("../../import/plan")]);
type Mods = Awaited<ReturnType<typeof loadImport>>;

interface Loaded {
  fileName: string;
  fileHash: string;
  sheets: Sheet[];
  sheet: number;
  headerRow: number;
  columns: Partial<Record<MappingField, number>>;
  profileId: string | null;
  encoding?: string;
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function MappingStep({ mods, loaded, setLoaded, onPreview }: { mods: Mods; loaded: Loaded; setLoaded(l: Loaded): void; onPreview(): void }) {
  const [, , mapping] = mods;
  const rows = loaded.sheets[loaded.sheet].rows;
  const header = rows[loaded.headerRow] ?? [];
  const sample = rows.slice(loaded.headerRow + 1).filter((r) => r.some(Boolean)).slice(0, 5);
  const missing = mapping.REQUIRED_FIELDS.filter((f) => loaded.columns[f] === undefined);

  return (
    <Section title="2. 열 맞추기">
      {loaded.profileId && <Banner tone="ok">전에 쓴 양식이에요. 저장해 둔 열 매핑을 불러왔어요.</Banner>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {loaded.sheets.length > 1 && (
          <label>시트 <select className="input" value={loaded.sheet} onChange={(e) => {
            const s = Number(e.target.value);
            const h = Math.max(0, mods[1].findHeaderRow(loaded.sheets[s].rows));
            setLoaded({ ...loaded, sheet: s, headerRow: h, columns: mapping.guessColumns(loaded.sheets[s].rows[h] ?? []), profileId: null });
          }}>{loaded.sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label>
        )}
        <label>머리글 행 <select className="input" value={loaded.headerRow} onChange={(e) => {
          const h = Number(e.target.value);
          setLoaded({ ...loaded, headerRow: h, columns: mapping.guessColumns(rows[h] ?? []), profileId: null });
        }}>{rows.slice(0, 30).map((r, i) => <option key={i} value={i}>{i + 1}행: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 50)}</option>)}</select></label>
        {loaded.encoding && <span className="text-stone-500">글자 인코딩: {loaded.encoding === "cp949" ? "CP949(한글 윈도우)" : "UTF-8"}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MAPPING_FIELDS.map((f) => (
          <label key={f} className="flex flex-col gap-1 text-sm">
            <span className={mapping.REQUIRED_FIELDS.includes(f) ? "font-semibold" : "text-stone-600"}>{mapping.FIELD_LABEL[f]}{mapping.REQUIRED_FIELDS.includes(f) && " *"}</span>
            <select className="input" value={loaded.columns[f] ?? ""} onChange={(e) => {
              const columns = { ...loaded.columns };
              if (e.target.value === "") delete columns[f];
              else columns[f] = Number(e.target.value);
              setLoaded({ ...loaded, columns });
            }}>
              <option value="">(없음)</option>
              {header.map((h, i) => <option key={i} value={i}>{h || `${i + 1}번째 열`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-stone-500">과목·코드는 예산 항목의 '코드·과목'과, 세부 항목명은 항목 이름과 맞춰 봐요. 고유번호(지출결의번호 등)가 있으면 중복 판정이 가장 정확해요.</p>
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="tbl">
          <thead><tr>{header.map((h, i) => {
            const f = MAPPING_FIELDS.find((x) => loaded.columns[x] === i);
            return <th key={i}>{h}{f && <div className="text-xs font-normal text-emerald-800">→ {mapping.FIELD_LABEL[f]}</div>}</th>;
          })}</tr></thead>
          <tbody>{sample.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {missing.length > 0 && <Banner tone="warn">{missing.map((f) => mapping.FIELD_LABEL[f]).join(", ")} 열을 골라 주세요.</Banner>}
      <Button kind="primary" disabled={missing.length > 0} onClick={onPreview}>미리보기</Button>
    </Section>
  );
}

function PreviewStep({ plan, setPlan, mods, onApply, remember, setRemember }: {
  plan: Plan; setPlan(p: Plan): void; mods: Mods; onApply(): void;
  remember: Set<number>; setRemember(s: Set<number>): void;
}) {
  const { data, idx } = useStore();
  const fy = useFiscalYear();
  const opts = useMemo(() => itemOptions(data, idx, fy?.id), [data, idx, fy?.id]);
  const label = new Map(opts.map((o) => [o.id, o.label]));
  const [tab, setTab] = useState<RowStatus | "over">(plan.counts.unmatched ? "unmatched" : "new");
  const c = plan.counts;
  const shown = plan.rows.filter((r) => (tab === "over" ? r.overLimit : r.status === tab)).slice(0, 300);

  const tabs: [RowStatus | "over", string, number][] = [
    ["new", "신규", c.new], ["unmatched", "짝 없음", c.unmatched], ["duplicate", "이미 있음", c.duplicate],
    ["excluded", "제외", c.excluded], ["over", "한도 초과", c.overLimit],
  ];

  return (
    <Section title="3. 미리보기">
      <div className="rounded border border-stone-200 bg-white p-3 text-sm">
        <p>
          읽은 행 <b>{formatNumber(c.read)}</b> = 신규 {formatNumber(c.new)} + 이미 있음 {formatNumber(c.duplicate)} + 짝 없음 {formatNumber(c.unmatched)} + 제외 {formatNumber(c.excluded)}
          {c.new + c.duplicate + c.unmatched + c.excluded === c.read ? " ✓" : " — 맞지 않아요(버그)"}
        </p>
        <p>반영할 금액: 신규 <Won n={plan.sums.new} /> + 짝 없음 <Won n={plan.sums.unmatched} /> = <b><Won n={plan.sums.new + plan.sums.unmatched} /></b> · 이미 있음 <Won n={plan.sums.duplicate} /></p>
        {c.excluded > 0 && <p className="text-stone-600">제외: {Object.entries(plan.excludedBy).map(([k, v]) => `${k} ${v}건`).join(", ")}</p>}
        {c.overLimit > 0 && <p className="text-amber-700">한도를 넘기는 행이 {c.overLimit}건 있어요. 에듀파인이 기준이라 반영은 하고 대시보드에 경고로 남겨요.</p>}
        {c.unmatched > 0 && <p className="text-amber-700">짝 없는 {c.unmatched}건은 아래에서 항목을 고르거나, 그대로 반영하면 '미분류'로 들어가요(잔액 계산에서 빠져요).</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded px-3 py-1 text-sm ${tab === k ? "bg-emerald-800 text-white" : "border border-stone-300 bg-white"}`}>{l} {n}</button>
        ))}
      </div>
      {shown.length === 0 ? <Empty>해당하는 행이 없어요.</Empty> : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="tbl">
            <thead><tr><th>행</th><th>날짜</th><th className="num">금액</th><th>적요</th><th>과목·항목</th><th>{tab === "excluded" || tab === "duplicate" ? "이유" : "연결할 항목"}</th></tr></thead>
            <tbody>
              {shown.map((r: PlanRow) => (
                <tr key={r.line} className={r.overLimit ? "bg-amber-50" : ""}>
                  <td className="text-stone-500">{r.line}</td>
                  <td className="whitespace-nowrap">{r.date ?? "—"}</td>
                  <td className="num">{r.amount === null ? "—" : <Won n={r.amount} />}</td>
                  <td>{r.summary}{r.vendor && <span className="text-stone-500"> · {r.vendor}</span>}</td>
                  <td className="text-xs text-stone-600">{[r.projectName, r.itemCode, r.itemName].filter(Boolean).join(" / ")}</td>
                  <td>
                    {r.status === "excluded" || r.status === "duplicate" ? <span className="text-stone-500">{r.reason}</span> : (
                      <div className="flex flex-col gap-1">
                        <select className={`input ${r.status === "unmatched" ? "border-amber-400" : ""}`} value={r.itemId ?? ""} onChange={(e) => setPlan(mods[3].assignManually(data, plan, r.line, e.target.value || null))}>
                          <option value="">{r.status === "unmatched" ? `미분류로 반영 (${r.reason})` : "(연결 해제)"}</option>
                          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        {r.matchedBy && r.matchedBy !== "manual" && <span className="text-xs text-stone-500">{{ rule: "규칙", code: "코드", name: "이름" }[r.matchedBy]}으로 맞춤: {label.get(r.itemId!)}</span>}
                        {r.matchedBy === "manual" && (r.itemCode || r.summary) && (
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={remember.has(r.line)} onChange={(e) => {
                              const s = new Set(remember);
                              if (e.target.checked) s.add(r.line); else s.delete(r.line);
                              setRemember(s);
                            }} />
                            다음부터 {r.itemCode ? `과목 '${r.itemCode}'` : `적요 '${r.summary}'`}은 이 항목으로
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plan.rows.filter((r) => (tab === "over" ? r.overLimit : r.status === tab)).length > 300 && <p className="text-xs text-stone-500">처음 300행만 보여 줘요.</p>}
      <Button kind="primary" disabled={c.new + c.unmatched === 0} onClick={onApply}>{formatNumber(c.new + c.unmatched)}건 반영하기</Button>
    </Section>
  );
}

function History() {
  const { data, run } = useStore();
  const { flash, setFlash } = useFlash();
  const [asking, setAsking] = useState<string | null>(null);
  const batches = data.uploadBatches.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (batches.length === 0) return null;
  const evCount = (batchId: string) => {
    const ids = new Set(data.executions.filter((e) => e.batchId === batchId && !e.deletedAt).map((e) => e.id));
    return data.evidences.filter((e) => !e.deletedAt && ids.has(e.executionId)).length;
  };
  return (
    <Section title="업로드 이력">
      {flash}
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="tbl">
          <thead><tr><th>올린 때</th><th>파일</th><th className="num">읽음</th><th className="num">반영</th><th className="num">짝 없음</th><th className="num">이미 있음</th><th className="num">제외</th><th className="num">금액</th><th /></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className={b.revertedAt ? "text-stone-400" : ""}>
                <td className="whitespace-nowrap">{new Date(b.createdAt).toLocaleString("ko-KR")}</td>
                <td>{b.fileName}{b.revertedAt && <span className="ml-1 text-xs">(되돌림)</span>}</td>
                <td className="num">{b.counts.read}</td>
                <td className="num">{b.counts.created}</td>
                <td className="num">{b.counts.unmatched}</td>
                <td className="num">{b.counts.duplicate}</td>
                <td className="num">{b.counts.excluded}</td>
                <td className="num"><Won n={b.sum} /></td>
                <td>{!b.revertedAt && <Button kind="ghost" className="text-red-700" onClick={() => setAsking(b.id)}>되돌리기</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {asking && (
        <ConfirmBar
          message={<>이 업로드로 들어온 집행을 모두 지울까요?{evCount(asking) > 0 && <b> 붙여 둔 증빙 {evCount(asking)}개는 지운 집행에 남아요.</b>} 되돌린 뒤 같은 파일을 다시 올릴 수 있어요.</>}
          needReason="되돌리는 이유" confirmLabel="되돌리기" onCancel={() => setAsking(null)}
          onConfirm={async (reason) => {
            const r = await run(revertUpload, { batchId: asking, reason });
            setAsking(null);
            setFlash(r.ok ? { tone: "ok", text: "업로드를 되돌렸어요." } : { tone: "error", text: r.message });
          }}
        />
      )}
    </Section>
  );
}

export function Upload() {
  const { data, run } = useStore();
  const fy = useFiscalYear();
  const { flash, setFlash } = useFlash();
  const [mods, setMods] = useState<Mods | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [remember, setRemember] = useState<Set<number>>(new Set());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setFlash(null); setPlan(null); setLoaded(null); setBusy(true);
    try {
      const m = mods ?? (await loadImport());
      setMods(m);
      const [read, header, mapping] = m;
      const buf = await file.arrayBuffer();
      const r = read.readSpreadsheet(new Uint8Array(buf), file.name);
      if (!r.ok) return setFlash({ tone: "error", text: r.message });
      const sheet = Math.max(0, r.sheets.findIndex((s) => header.findHeaderRow(s.rows) >= 0));
      const rows = r.sheets[sheet].rows;
      const h = header.findHeaderRow(rows);
      const profile = h >= 0 ? mapping.findProfile(data.mappingProfiles, rows[h]) : null;
      const fileHash = await sha256(buf);
      const prev = data.uploadBatches.find((b) => b.fileHash === fileHash && !b.revertedAt);
      if (prev) setFlash({ tone: "warn", text: `같은 파일을 ${prev.createdAt.slice(0, 10)}에 올린 적이 있어요. 이미 반영한 행은 '이미 있음'으로 걸러요.` });
      setLoaded({
        fileName: file.name, fileHash, sheets: r.sheets, sheet, headerRow: Math.max(0, h), encoding: r.encoding,
        columns: profile?.columns ?? mapping.guessColumns(rows[Math.max(0, h)] ?? []), profileId: profile?.id ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  function preview() {
    if (!mods || !loaded || !fy) return;
    const rows = loaded.sheets[loaded.sheet].rows;
    const profile = loaded.profileId ? data.mappingProfiles.find((p) => p.id === loaded.profileId) : null;
    setRemember(new Set());
    setPlan(mods[3].buildPlan(data, { rows, headerRow: loaded.headerRow, columns: loaded.columns, rules: profile?.rules ?? [], fiscalYear: fy }));
  }

  async function apply() {
    if (!mods || !loaded || !plan) return;
    setAsking(false);
    const header = loaded.sheets[loaded.sheet].rows[loaded.headerRow] ?? [];
    const rules: MatchRule[] = plan.rows
      .filter((r) => remember.has(r.line) && r.matchedBy === "manual" && r.itemId)
      .map((r) => (r.itemCode ? { field: "itemCode" as const, value: r.itemCode, itemId: r.itemId! } : { field: "summary" as const, value: r.summary, itemId: r.itemId! }));
    // 열 매핑과 새 규칙을 양식별로 기억한다
    const prof = await run(saveMappingProfile, {
      id: loaded.profileId ?? undefined, name: loaded.fileName, headerSignature: mods[2].headerSignature(header), columns: loaded.columns, addRules: rules,
    });
    const r = await run(applyUpload, { fileName: loaded.fileName, fileHash: loaded.fileHash, profileId: prof.ok ? prof.id ?? null : null, rows: plan.rows });
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    setFlash({ tone: "ok", text: `${formatNumber(plan.counts.new + plan.counts.unmatched)}건을 반영했어요.${plan.counts.unmatched ? ` 미분류 ${plan.counts.unmatched}건은 집행 화면에서 항목을 고를 수 있어요.` : ""}${rules.length ? ` 매칭 규칙 ${rules.length}개를 기억했어요.` : ""}` });
    setPlan(null);
    setLoaded(null);
  }

  return (
    <div className="space-y-8">
      <Section title="1. 에듀파인 엑셀 올리기">
        <p className="text-sm text-stone-600">
          에듀파인에서 내려받은 집행 내역(.xlsx·.xls·.csv)을 올려요. 반영하기 전에 미리보기로 확인하고, 잘못 올렸으면 이력에서 되돌릴 수 있어요.
          파일은 이 브라우저 밖으로 나가지 않아요.
        </p>
        <label className="inline-block cursor-pointer rounded bg-emerald-800 px-3 py-1.5 text-sm text-white hover:bg-emerald-900">
          {busy ? "읽는 중…" : "파일 고르기…"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        </label>
        {flash}
      </Section>
      {mods && loaded && <MappingStep mods={mods} loaded={loaded} setLoaded={(l) => { setLoaded(l); setPlan(null); }} onPreview={preview} />}
      {mods && plan && (
        <>
          <PreviewStep plan={plan} setPlan={setPlan} mods={mods} onApply={() => setAsking(true)} remember={remember} setRemember={setRemember} />
          {asking && (
            <ConfirmBar
              message={<>신규 {plan.counts.new}건과 미분류 {plan.counts.unmatched}건, 합계 <Won n={plan.sums.new + plan.sums.unmatched} />을 반영할까요?</>}
              confirmLabel="반영" onConfirm={apply} onCancel={() => setAsking(false)}
            />
          )}
        </>
      )}
      <History />
    </div>
  );
}

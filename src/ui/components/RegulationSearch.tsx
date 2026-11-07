// 사업에 붙인 규정 문서에서 낱말 찾기 (#14). 뽑은 글자는 이 화면이 떠 있는 동안만 기억한다.
import { useState } from "react";
import type { Snippet, TextResult } from "../../import/docText";
import { useStore } from "../../state/store";
import { Button, download } from "./ui";

const cache = new Map<string, TextResult>();

export function RegulationSearch({ fileIds }: { fileIds: string[] }) {
  const readFile = useStore((s) => s.readFile);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ id: string; name: string; result: TextResult; snippets: Snippet[] }[] | null>(null);
  if (fileIds.length === 0) return null;

  async function search() {
    setBusy(true);
    const [{ extractText, findSnippets }, { pdfToText }] = await Promise.all([import("../../import/docText"), import("../../import/pdfText")]);
    const out = [];
    for (const id of fileIds) {
      const f = await readFile(id);
      if (!f) continue;
      let r = cache.get(id);
      if (!r) { r = await extractText(f.name, f.data, pdfToText); cache.set(id, r); }
      out.push({ id, name: f.name, result: r, snippets: r.ok ? findSnippets(r.text, q) : [] });
    }
    setResults(out);
    setBusy(false);
  }
  async function open(id: string) {
    const f = await readFile(id);
    if (f) download(new Blob([f.data], { type: f.type }), f.name);
  }

  return (
    <div className="space-y-2 rounded border border-stone-200 bg-white p-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(); }}>
        <input className="input w-64" placeholder="규정에서 찾기 (예: 강사수당)" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" disabled={!q.trim() || busy}>{busy ? "찾는 중…" : "찾기"}</Button>
      </form>
      {results?.map((r) => (
        <div key={r.id} className="text-sm">
          <div className="font-medium">{r.name} <Button kind="ghost" onClick={() => open(r.id)}>원문 열기</Button></div>
          {!r.result.ok ? <p className="text-amber-700">글자를 뽑지 못했어요: {r.result.reason}</p>
            : r.snippets.length === 0 ? <p className="text-stone-500">'{q}'가 없어요.</p>
            : <ul className="list-disc pl-5">{r.snippets.map((s, i) => <li key={i}>…{s.before}<mark>{s.hit}</mark>{s.after}…</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}

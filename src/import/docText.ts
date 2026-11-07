// 규정 문서에서 검색용 글자를 뽑는다 (#14). 해석이 아니라 찾기용이다.
// 뽑지 못하면 숨기지 않고 이유를 돌려준다 — 화면은 "원문 열기"로 대신한다.
import { strFromU8, unzipSync } from "fflate";

export type TextResult = { ok: true; text: string } | { ok: false; reason: string };
export type PdfToText = (bytes: Uint8Array) => Promise<string>;

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function hwpxText(bytes: Uint8Array): TextResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, reason: "HWPX 파일이 깨졌어요." };
  }
  const sections = Object.keys(files).filter((k) => /^Contents\/section\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (sections.length === 0) return { ok: false, reason: "HWPX 본문을 찾지 못했어요." };
  const text = sections.map((k) => {
    const xml = strFromU8(files[k]);
    return xml.split(/<\/hp:p>/).map((p) => [...p.matchAll(/<hp:t(?:\s[^>]*)?>([^<]*)<\/hp:t>/g)].map((m) => decodeXml(m[1])).join("")).filter(Boolean).join("\n");
  }).join("\n");
  return text.trim() ? { ok: true, text } : { ok: false, reason: "HWPX에 글자가 없어요." };
}

export async function extractText(name: string, data: ArrayBuffer, pdfToText: PdfToText): Promise<TextResult> {
  const bytes = new Uint8Array(data);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "hwpx") return hwpxText(bytes);
  if (ext === "hwp") return { ok: false, reason: "구형 한글(.hwp)은 글자를 뽑지 못해요. 한글에서 .hwpx나 PDF로 저장해 올리면 검색돼요." };
  if (ext === "txt") return { ok: true, text: new TextDecoder().decode(bytes) };
  if (ext === "pdf") {
    try {
      const text = await pdfToText(bytes);
      // 글자가 거의 없으면 스캔본이다. OCR은 하지 않는다
      if (text.replace(/\s/g, "").length < 20) return { ok: false, reason: "스캔한 PDF라 글자가 없어요." };
      return { ok: true, text };
    } catch {
      return { ok: false, reason: "PDF를 읽지 못했어요." };
    }
  }
  return { ok: false, reason: "이 형식은 검색하지 않아요." };
}

export interface Snippet { before: string; hit: string; after: string }

/** 공백 차이를 무시하고 찾는다. 앞뒤 글자를 붙여 보여 준다 */
export function findSnippets(text: string, query: string, radius = 40, max = 5): Snippet[] {
  const q = query.trim();
  if (!q) return [];
  // 글자마다 사이 공백을 허용한다: "강사수당"으로 "강사 수당"도 찾는다
  const chars = [...q.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(chars.join("\\s*"), "gi");
  const out: Snippet[] = [];
  for (const m of text.matchAll(pattern)) {
    const i = m.index!;
    out.push({
      before: text.slice(Math.max(0, i - radius), i).replace(/\s+/g, " "),
      hit: m[0],
      after: text.slice(i + m[0].length, i + m[0].length + radius).replace(/\s+/g, " "),
    });
    if (out.length >= max) break;
  }
  return out;
}

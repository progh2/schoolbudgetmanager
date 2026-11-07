import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractText, findSnippets, type PdfToText } from "./docText";

const fx = (n: string) => readFileSync(join(__dirname, "../../tests/fixtures", n));
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// 테스트에서는 Node용(legacy) pdf.js로 같은 일을 한다
const nodePdf: PdfToText = async (bytes) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(1);
  const c = await page.getTextContent();
  return c.items.map((it) => ("str" in it ? it.str : "")).join(" ");
};

describe("규정 문서 글자 뽑기", () => {
  it("HWPX 본문을 문단별로 뽑고 엔티티를 풀어 준다", async () => {
    const r = await extractText("규정.hwpx", buf(fx("regulation.hwpx")), nodePdf);
    expect(r.ok && r.text).toContain("시간당 40,000원을 넘을 수 없다");
    expect(r.ok && r.text).toContain("원칙으로 & 예외");
    expect(r.ok && r.text.split("\n")).toHaveLength(2);
  });

  it("글자 PDF는 뽑고, 글자가 없는 PDF는 스캔본이라고 말한다", async () => {
    const r = await extractText("rule.pdf", buf(fx("regulation.pdf")), nodePdf);
    expect(r.ok && r.text).toContain("Instructor fee");
    const scanned = await extractText("scan.pdf", new ArrayBuffer(4), async () => " ");
    expect(scanned).toEqual({ ok: false, reason: "스캔한 PDF라 글자가 없어요." });
    const broken = await extractText("x.pdf", new ArrayBuffer(4), async () => { throw new Error("bad"); });
    expect(broken.ok).toBe(false);
  });

  it("구형 HWP와 모르는 형식은 이유를 말한다", async () => {
    expect((await extractText("a.hwp", new ArrayBuffer(1), nodePdf)).ok).toBe(false);
    expect((await extractText("a.png", new ArrayBuffer(1), nodePdf)).ok).toBe(false);
  });

  it("검색은 공백 차이를 무시하고 앞뒤 글자를 붙인다", () => {
    const s = findSnippets("제5조(강사수당) 방과후학교 강사 수당은 시간당 40,000원", "강사수당");
    expect(s).toHaveLength(2);
    expect(s[1]).toMatchObject({ hit: "강사 수당" });
    expect(findSnippets("abc", "")).toEqual([]);
    expect(findSnippets("a(b)c", "(b)")[0].hit).toBe("(b)");
  });
});

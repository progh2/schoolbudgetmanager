// 브라우저용 PDF 글자 뽑기. pdf.js는 크니 규정 검색을 처음 쓸 때만 불러온다.
import type { PdfToText } from "./docText";

export const pdfToText: PdfToText = async (bytes) => {
  const pdfjs = await import("pdfjs-dist");
  // new Worker(new URL(...)) 꼴이어야 Vite가 워커를 .js로 묶는다.
  // .mjs 그대로 두면 .mjs를 JavaScript로 보내지 않는 호스팅에서 PDF 검색이 조용히 죽는다
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  // pdf.js가 버퍼를 워커로 넘기며 비워 버리므로 사본을 준다
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await task.destroy();
  return pages.join("\n");
};

// 실제 브라우저로 dist/를 눌러 본다. 사용: npm run build && npm run smoke
// 하위 경로(/schoolbudgetmanager/)와 루트(/) 둘 다 확인 — base: './'가 두 배포처를 지키는지.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { serve } from "./serve.mjs";
import { evidenceScenario, scenario, uploadScenario } from "./scenario.mjs";

const OUT = "test-results/smoke";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;

for (const [prefix, port] of [["/schoolbudgetmanager/", 4317], ["/", 4318]]) {
  const server = await serve("dist", prefix, port);
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const base = `http://localhost:${port}${prefix}`;
  try {
    const shot = `${OUT}/${prefix === "/" ? "root" : "subpath"}`;
    await scenario(page, base, shot, prefix === "/");
    if (prefix === "/") {
      await uploadScenario(page, base, shot);
      await evidenceScenario(page, base, shot);
    }
    if (errors.length) throw new Error(`콘솔 오류: ${errors.join(" | ")}`);
    console.log(`ok   ${base}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${base}\n  ${e.message}${errors.length ? `\n  콘솔: ${errors.join(" | ")}` : ""}`);
    await page.screenshot({ path: `${OUT}/fail-${port}.png`, fullPage: true });
  }
  await page.close();
  server.close();
}
await browser.close();
process.exit(failed ? 1 : 0);

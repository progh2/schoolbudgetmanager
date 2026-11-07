// 구조 규칙을 grep으로 못박는다 (ARCHITECTURE §2, §3).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
const src = join(__dirname);
const code = (p: string) => readFileSync(p, "utf8");

describe("구조 규칙", () => {
  it("domain/·import/는 React·Dexie·storage·DOM 전역을 모른다", () => {
    for (const f of [...files(join(src, "domain")), ...files(join(src, "import"))].filter((f) => !f.endsWith(".test.ts"))) {
      const c = code(f);
      expect(c, f).not.toMatch(/from "react|from "dexie|from "\.\.\/storage|from "\.\.\/state|from "\.\.\/ui/);
      expect(c, f).not.toMatch(/\b(document|window|localStorage)\./);
    }
  });

  it("transact를 부르는 곳은 스토어와 저장소뿐이다 (쓰기는 한 입구로)", () => {
    const callers = files(src)
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => /\.transact\(/.test(code(f)))
      .map((f) => f.replace(src + "/", ""));
    expect(callers.sort()).toEqual(["state/store.ts"]);
  });

  it("ui/는 저장소 어댑터를 직접 import하지 않는다", () => {
    for (const f of files(join(src, "ui"))) expect(code(f), f).not.toMatch(/storage\/adapters|from "dexie"/);
  });

  it("브라우저 대화상자를 쓰지 않는다", () => {
    for (const f of files(src).filter((f) => !f.endsWith(".test.ts")))
      expect(code(f), f).not.toMatch(/\b(alert|confirm|prompt)\(/);
  });

  it("도메인 함수 안에서 시계를 직접 읽지 않는다 (ctx.ts 제외)", () => {
    for (const f of files(join(src, "domain")).filter((f) => !f.endsWith("ctx.ts") && !f.endsWith(".test.ts")))
      expect(code(f), f).not.toMatch(/new Date\(\)|Date\.now\(\)/);
  });
});

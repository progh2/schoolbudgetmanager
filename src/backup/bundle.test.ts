import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createExecutionFixture } from "../domain/fixtures";
import { buildBackup, parseBackup } from "./bundle";

describe("백업 zip", () => {
  it("내보낸 것을 가져오면 건수·금액 합·파일이 같다", () => {
    const data = createExecutionFixture();
    const file = { id: "f1", name: "결의서.pdf", type: "application/pdf", size: 4, data: new Uint8Array([37, 80, 68, 70]).buffer };
    const zip = buildBackup(data, [file], "2026-04-01T00:00:00.000Z", "0.1.0");
    const r = parseBackup(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual(data);
    expect(r.summary.files).toBe(1);
    expect(r.summary.executionSum).toBe(data.executions.reduce((s, e) => s + e.amount, 0));
    expect(new Uint8Array(r.files[0].data)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("깨진 zip, 다른 앱 파일, 미래 버전, 빠진 파일은 각각 이유를 말한다", () => {
    const codeOf = (b: Uint8Array) => { const r = parseBackup(b); return r.ok ? "ok" : r.code; };
    expect(codeOf(new Uint8Array([1, 2, 3]))).toBe("not_zip");
    expect(codeOf(zipSync({ "a.txt": strToU8("x") }))).toBe("not_backup");
    expect(codeOf(zipSync({ "bundle.json": strToU8(JSON.stringify({ app: "other", schemaVersion: 1, exportedAt: "", entities: {} })) }))).toBe("not_backup");
    expect(codeOf(zipSync({ "bundle.json": strToU8(JSON.stringify({ app: "yesanjigi", schemaVersion: 99, exportedAt: "", entities: {} })) }))).toBe("too_new");
    expect(codeOf(zipSync({
      "bundle.json": strToU8(JSON.stringify({ app: "yesanjigi", schemaVersion: 1, exportedAt: "", entities: {} })),
      "files/index.json": strToU8(JSON.stringify([{ id: "f9", name: "x.pdf", type: "", size: 1 }])),
    }))).toBe("missing_file");
  });

  it("엔티티가 스키마에 안 맞으면 어느 표인지 말한다", () => {
    const bad = { app: "yesanjigi", schemaVersion: 1, exportedAt: "", entities: { projects: [{ id: "p" }] } };
    const r = parseBackup(zipSync({ "bundle.json": strToU8(JSON.stringify(bad)) }));
    expect(r.ok === false && r.message).toContain("projects");
  });
});

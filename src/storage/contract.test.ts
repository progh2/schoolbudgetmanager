// 모든 어댑터가 통과해야 하는 계약. 새 어댑터(desktop·firebase)는 여기에 한 줄 추가해 통과해야 들어온다.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Department, Write } from "../schema/entities";
import { createLocalRepository } from "./adapters/local";
import { createMemoryRepository } from "./adapters/memory";
import type { Repository } from "./repository";

let n = 0;
const adapters: [string, () => Repository][] = [
  ["memory", createMemoryRepository],
  ["local", () => createLocalRepository(`test-${++n}`)],
];

const T = "2026-03-01T09:00:00.000+09:00";
const dept = (id: string, name = "교무부"): Department => ({
  id, name, order: 0, active: true, createdAt: T, updatedAt: T, deletedAt: null,
});

describe.each(adapters)("Repository 계약: %s", (_, make) => {
  it("비어 있으면 []를 준다 (null 아님)", async () => {
    const repo = make();
    expect(await repo.list("projects")).toEqual([]);
    expect(await repo.get("projects", "없음")).toBeNull();
    const all = await repo.loadAll();
    expect(all.executions).toEqual([]);
  });

  it("transact로 쓴 것은 다시 읽힌다, 같은 id는 덮어쓴다", async () => {
    const repo = make();
    await repo.transact([{ table: "departments", value: dept("d1") }]);
    await repo.transact([{ table: "departments", value: dept("d1", "행정실") }]);
    const rows = await repo.list("departments");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("행정실");
  });

  it("soft delete된 행도 get으로 읽힌다 (지우는 것은 표시일 뿐)", async () => {
    const repo = make();
    await repo.transact([{ table: "departments", value: { ...dept("d1"), deletedAt: T } }]);
    expect((await repo.get("departments", "d1"))?.deletedAt).toBe(T);
  });

  it("하나라도 잘못되면 아무것도 쓰지 않는다", async () => {
    const repo = make();
    const bad = { ...dept("d2"), order: 1.5 } as Department; // 정수 아님
    await expect(repo.transact([{ table: "departments", value: dept("d1") }, { table: "departments", value: bad }])).rejects.toThrow();
    expect(await repo.list("departments")).toEqual([]);
  });

  it("금액에 소수를 넣으면 거부한다", async () => {
    const repo = make();
    const w = {
      table: "executions",
      value: {
        id: "e1", createdAt: T, updatedAt: T, deletedAt: null, itemId: null, date: "2026-03-02",
        amount: 1000.5, summary: "", vendor: "", source: "manual", batchId: null, dedupeKey: null, overLimitReason: null,
      },
    } as Write;
    await expect(repo.transact([w])).rejects.toThrow();
  });

  it("replaceAll은 표와 파일을 통째로 바꾼다", async () => {
    const repo = make();
    await repo.transact([{ table: "departments", value: dept("old") }]);
    const data = await repo.loadAll();
    data.departments = [dept("new")];
    const file = { id: "f1", name: "a.pdf", type: "application/pdf", size: 3, data: new Uint8Array([1, 2, 3]).buffer };
    await repo.replaceAll(data, [file]);
    expect((await repo.list("departments")).map((d) => d.id)).toEqual(["new"]);
    const back = await repo.files.read("f1");
    expect(new Uint8Array(back!.data)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

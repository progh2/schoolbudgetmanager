// 테스트용 어댑터. local 어댑터와 같은 계약 테스트를 통과한다.
import { TABLES, emptyData, tableSchemas, type Data, type StoredFile, type TableName, type Tables, type Write } from "../../../schema/entities";
import type { Repository } from "../../repository";

export function createMemoryRepository(): Repository {
  let data: Data = emptyData();
  let files = new Map<string, StoredFile>();

  return {
    kind: "memory",
    async list<K extends TableName>(table: K) {
      return structuredClone(data[table]) as Tables[K][];
    },
    async get<K extends TableName>(table: K, id: string) {
      const row = (data[table] as Tables[K][]).find((r) => r.id === id);
      return row ? structuredClone(row) : null;
    },
    async transact(writes: Write[]) {
      // 전부 검증한 뒤에만 반영한다 — 중간 실패로 반쯤 쓰이는 일이 없게
      for (const w of writes) tableSchemas[w.table].parse(w.value);
      const next = structuredClone(data);
      for (const w of writes) {
        const rows = next[w.table] as { id: string }[];
        const i = rows.findIndex((r) => r.id === w.value.id);
        if (i >= 0) rows[i] = structuredClone(w.value);
        else rows.push(structuredClone(w.value));
      }
      data = next;
    },
    async loadAll() {
      return structuredClone(data);
    },
    async replaceAll(next: Data, nextFiles: StoredFile[]) {
      const copy = emptyData();
      for (const t of TABLES) (copy[t] as unknown[]) = structuredClone(next[t] ?? []);
      data = copy;
      files = new Map(nextFiles.map((f) => [f.id, f]));
    },
    files: {
      async save(file) {
        files.set(file.id, file);
      },
      async read(id) {
        return files.get(id) ?? null;
      },
      async list() {
        return [...files.values()];
      },
      async remove(id) {
        files.delete(id);
      },
    },
  };
}

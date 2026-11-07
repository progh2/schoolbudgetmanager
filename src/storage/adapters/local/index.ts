// M1 어댑터: 브라우저 IndexedDB(Dexie).
// DB 이름은 yesanjigi 고정 — progh2.github.io는 모든 Pages 프로젝트가 같은 origin이라 겹치면 안 된다.
import Dexie, { type Table } from "dexie";
import { TABLES, emptyData, tableSchemas, type Data, type StoredFile, type TableName, type Tables, type Write } from "../../../schema/entities";
import type { Repository } from "../../repository";

export const DB_NAME = "yesanjigi";

class YesanDB extends Dexie {
  files!: Table<StoredFile, string>;
  constructor(name: string) {
    super(name);
    const stores: Record<string, string> = { files: "id" };
    for (const t of TABLES) stores[t] = "id";
    this.version(1).stores(stores);
  }
  tableOf(name: TableName): Table<{ id: string }, string> {
    return this.table(name);
  }
}

export function createLocalRepository(name = DB_NAME): Repository {
  const db = new YesanDB(name);
  const all = [...TABLES.map((t) => db.tableOf(t)), db.files];

  return {
    kind: "local",
    async list<K extends TableName>(table: K) {
      return (await db.tableOf(table).toArray()) as Tables[K][];
    },
    async get<K extends TableName>(table: K, id: string) {
      return ((await db.tableOf(table).get(id)) as Tables[K] | undefined) ?? null;
    },
    async transact(writes: Write[]) {
      for (const w of writes) tableSchemas[w.table].parse(w.value);
      const tables = [...new Set(writes.map((w) => w.table))].map((t) => db.tableOf(t));
      if (tables.length === 0) return;
      await db.transaction("rw", tables, async () => {
        for (const w of writes) await db.tableOf(w.table).put(w.value);
      });
    },
    async loadAll() {
      const data = emptyData();
      for (const t of TABLES) (data[t] as unknown[]) = await db.tableOf(t).toArray();
      return data;
    },
    async replaceAll(next: Data, files: StoredFile[]) {
      await db.transaction("rw", all, async () => {
        for (const t of TABLES) {
          await db.tableOf(t).clear();
          await db.tableOf(t).bulkPut((next[t] ?? []) as { id: string }[]);
        }
        await db.files.clear();
        await db.files.bulkPut(files);
      });
    },
    files: {
      async save(file) {
        await db.files.put(file);
      },
      async read(id) {
        return (await db.files.get(id)) ?? null;
      },
      async list() {
        return db.files.toArray();
      },
      async remove(id) {
        await db.files.delete(id);
      },
    },
  };
}

// 자동 백업 폴더 (#17). File System Access API(Chrome·Edge)로 고른 폴더에 하루 한 번 zip을 쓴다.
// 폴더 핸들은 데이터가 아니라 기기 설정이라 백업에 넣지 않고 별도 IndexedDB에 둔다.
import Dexie, { type Table } from "dexie";
import { buildBackup } from "../backup/bundle";
import { autoBackupName, dueForAutoBackup, namesToPrune } from "../backup/rotation";
import { realCtx } from "../domain/ctx";
import { useStore } from "../state/store";

type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
};

class SettingsDB extends Dexie {
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super("yesanjigi-device");
    this.version(1).stores({ kv: "key" });
  }
}
const db = new SettingsDB();

export const autoBackupSupported = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

export async function getDir(): Promise<Dir | null> {
  return ((await db.kv.get("backupDir"))?.value as Dir | undefined) ?? null;
}

export async function pickDir(): Promise<Dir> {
  const dir = (await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ mode: "readwrite", id: "yesanjigi-backup" }));
  await db.kv.put({ key: "backupDir", value: dir });
  return dir;
}

export async function forgetDir() {
  await db.kv.delete("backupDir");
}

export async function writeBackup(dir: Dir): Promise<string> {
  const s = useStore.getState();
  const ctx = realCtx();
  const name = autoBackupName(ctx.today);
  const bytes = buildBackup(s.data, await s.allFiles(), ctx.now, "0.1.0");
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes.slice().buffer);
  await w.close();
  const names: string[] = [];
  for await (const h of dir.values()) if (h.kind === "file") names.push(h.name);
  for (const n of namesToPrune(names)) await dir.removeEntry(n);
  s.setMeta({ lastBackupAt: ctx.now, lastAutoBackupDay: ctx.today });
  return name;
}

/** 앱을 열 때 부른다. 결과: 저장함 / 할 일 없음 / 권한 다시 필요 */
export async function autoBackupOnOpen(): Promise<"saved" | "skip" | "need_permission"> {
  if (!autoBackupSupported()) return "skip";
  const dir = await getDir();
  if (!dir) return "skip";
  const { meta, data } = useStore.getState();
  if (data.projects.length === 0 || !dueForAutoBackup(meta.lastAutoBackupDay, realCtx().today)) return "skip";
  if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted") return "need_permission";
  await writeBackup(dir);
  return "saved";
}

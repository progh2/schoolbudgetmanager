// 백업 형식 (ARCHITECTURE §8): zip 안에 bundle.json + files/<id>.
// JSON 하나로는 증빙 파일(바이너리)이 빠지기 때문에 zip이다.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { TABLES, emptyData, tableSchemas, type Data, type StoredFile } from "../schema/entities";
import { fail, type Result } from "../domain/ctx";

export const APP_ID = "yesanjigi";
export const SCHEMA_VERSION = 1;

interface FileMetaRow { id: string; name: string; type: string; size: number }

export function buildBackup(data: Data, files: StoredFile[], exportedAt: string, appVersion: string): Uint8Array {
  const bundle = { app: APP_ID, schemaVersion: SCHEMA_VERSION, appVersion, exportedAt, entities: data };
  const meta: FileMetaRow[] = files.map(({ id, name, type, size }) => ({ id, name, type, size }));
  const entries: Record<string, Uint8Array> = {
    "bundle.json": strToU8(JSON.stringify(bundle)),
    "files/index.json": strToU8(JSON.stringify(meta)),
  };
  for (const f of files) entries[`files/${f.id}`] = new Uint8Array(f.data);
  // 증빙 PDF·이미지는 이미 압축돼 있어 레벨을 낮춰도 크기 차이가 거의 없다
  return zipSync(entries, { level: 1 });
}

export interface BackupSummary {
  exportedAt: string;
  counts: Record<string, number>;
  files: number;
  executionSum: number;
}

export function backupFileName(today: string) {
  return `예산지기-${today}.yesan.zip`;
}

/** 가져오기 전 검증. 하나라도 이상하면 아무것도 바꾸지 않도록 실패를 돌려준다 */
export function parseBackup(bytes: Uint8Array): Result<{ data: Data; files: StoredFile[]; summary: BackupSummary }> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return fail("not_zip", "zip 파일이 아니거나 깨졌어요. 예산지기에서 내보낸 .yesan.zip 파일을 골라 주세요.");
  }
  const raw = entries["bundle.json"];
  if (!raw) return fail("not_backup", "예산지기 백업이 아니에요(bundle.json 없음).");
  let bundle: unknown;
  try {
    bundle = JSON.parse(strFromU8(raw));
  } catch {
    return fail("broken", "백업 안의 데이터가 깨졌어요.");
  }
  const head = z.object({ app: z.string(), schemaVersion: z.number().int(), exportedAt: z.string(), entities: z.record(z.string(), z.unknown()) }).safeParse(bundle);
  if (!head.success || head.data.app !== APP_ID) return fail("not_backup", "예산지기 백업이 아니에요.");
  if (head.data.schemaVersion > SCHEMA_VERSION)
    return fail("too_new", `더 새 버전(형식 ${head.data.schemaVersion})에서 만든 백업이에요. 앱을 새로 고친 뒤 다시 가져와 주세요.`);

  const data = emptyData();
  for (const t of TABLES) {
    const parsed = z.array(tableSchemas[t]).safeParse(head.data.entities[t] ?? []);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail("invalid", `백업의 '${t}' 자료가 올바르지 않아요 (${issue.path.join(".")}: ${issue.message}).`);
    }
    (data[t] as unknown[]) = parsed.data;
  }

  const metaRaw = entries["files/index.json"];
  const meta: FileMetaRow[] = metaRaw ? JSON.parse(strFromU8(metaRaw)) : [];
  const files: StoredFile[] = [];
  for (const m of meta) {
    const body = entries[`files/${m.id}`];
    if (!body) return fail("missing_file", `백업에 '${m.name}' 파일이 빠져 있어요.`);
    files.push({ ...m, data: body.slice().buffer });
  }

  const counts = Object.fromEntries(TABLES.map((t) => [t, data[t].filter((r) => !r.deletedAt).length]));
  const executionSum = data.executions.filter((e) => !e.deletedAt).reduce((s, e) => s + e.amount, 0);
  return { ok: true, data, files, summary: { exportedAt: head.data.exportedAt, counts, files: files.length, executionSum } };
}

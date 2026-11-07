// 업로드 반영·되돌리기·매핑 프로필 저장 명령. 반영은 배치 + 집행 전부를 한 번의 transact로.
import type { Data, Execution, MappingProfile, MatchRule, UploadBatch, Write } from "../schema/entities";
import { auditWrite, fail, live, type Ctx, type Result } from "./ctx";

/** import/plan.ts의 PlanRow 중 반영에 필요한 부분 (domain이 import/를 모르도록 따로 적는다) */
export interface ApplyRow {
  status: "new" | "duplicate" | "unmatched" | "excluded";
  date: string | null;
  amount: number | null;
  summary: string;
  vendor: string;
  itemId: string | null;
  dedupeKey: string | null;
  overLimit: boolean;
}

export interface ApplyInput {
  fileName: string;
  fileHash: string;
  profileId: string | null;
  rows: ApplyRow[];
}

export function applyUpload(data: Data, input: ApplyInput, ctx: Ctx): Result {
  const reverted = new Set(data.uploadBatches.filter((b) => b.revertedAt).map((b) => b.id));
  const existing = new Set(live(data.executions).filter((e) => e.dedupeKey && !(e.batchId && reverted.has(e.batchId))).map((e) => e.dedupeKey));
  const items = new Set(live(data.items).map((i) => i.id));
  const take = input.rows.filter((r) => r.status === "new" || r.status === "unmatched");
  if (take.length === 0) return fail("nothing", "반영할 새 행이 없어요.");

  const batchId = ctx.newId();
  const writes: Write[] = [];
  let sum = 0;
  for (const r of take) {
    if (!r.date || r.amount === null || !r.dedupeKey) return fail("invalid", "미리보기가 오래됐어요. 파일을 다시 올려 주세요.");
    // 미리보기 뒤에 다른 업로드가 같은 행을 넣었을 수 있다 — 반영 직전에 다시 본다
    if (existing.has(r.dedupeKey)) return fail("stale", "그사이 같은 행이 반영됐어요. 파일을 다시 올려 미리보기를 새로 만들어 주세요.");
    if (r.itemId && !items.has(r.itemId)) return fail("stale", "연결한 항목이 지워졌어요. 다시 미리보기 해 주세요.");
    const value: Execution = {
      id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
      itemId: r.status === "new" ? r.itemId : null,
      date: r.date, amount: r.amount, summary: r.summary, vendor: r.vendor,
      source: "upload", batchId, dedupeKey: r.dedupeKey, overLimitReason: null,
    };
    writes.push({ table: "executions", value });
    sum += r.amount;
  }
  const count = (s: ApplyRow["status"]) => input.rows.filter((r) => r.status === s).length;
  const batch: UploadBatch = {
    id: batchId, createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
    fileName: input.fileName, fileHash: input.fileHash, profileId: input.profileId,
    counts: {
      read: input.rows.length, created: count("new"), duplicate: count("duplicate"), unmatched: count("unmatched"),
      excluded: count("excluded"), overLimit: input.rows.filter((r) => r.overLimit).length,
    },
    sum, revertedAt: null,
  };
  writes.unshift({ table: "uploadBatches", value: batch });
  writes.push(auditWrite(ctx, "uploadBatch", batchId, "upload:apply", null, { fileName: batch.fileName, counts: batch.counts, sum }));
  return { ok: true, id: batchId, writes };
}

export function revertUpload(data: Data, input: { batchId: string; reason: string }, ctx: Ctx): Result {
  const before = data.uploadBatches.find((b) => b.id === input.batchId);
  if (!before) return fail("not_found", "업로드 기록을 찾지 못했어요.");
  if (before.revertedAt) return fail("already", "이미 되돌린 업로드예요.");
  if (!input.reason.trim()) return fail("reason_required", "되돌리는 이유를 적어 주세요.");
  const writes: Write[] = [{ table: "uploadBatches", value: { ...before, revertedAt: ctx.now, updatedAt: ctx.now } }];
  for (const e of live(data.executions).filter((e) => e.batchId === before.id))
    writes.push({ table: "executions", value: { ...e, deletedAt: ctx.now, updatedAt: ctx.now } });
  writes.push(auditWrite(ctx, "uploadBatch", before.id, "upload:revert", null, { removed: writes.length - 1 }, input.reason.trim()));
  return { ok: true, writes };
}

export function saveMappingProfile(
  data: Data,
  input: { id?: string; name: string; headerSignature: string; columns: MappingProfile["columns"]; addRules?: MatchRule[] },
  ctx: Ctx,
): Result {
  const before = input.id ? data.mappingProfiles.find((p) => p.id === input.id) ?? null : null;
  const rules = [...(before?.rules ?? [])];
  for (const r of input.addRules ?? []) {
    const i = rules.findIndex((x) => x.field === r.field && x.value === r.value);
    if (i >= 0) rules[i] = r;
    else rules.push(r);
  }
  const value: MappingProfile = before
    ? { ...before, name: input.name, headerSignature: input.headerSignature, columns: input.columns, rules, updatedAt: ctx.now }
    : { id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null, name: input.name, headerSignature: input.headerSignature, columns: input.columns, rules };
  return { ok: true, id: value.id, writes: [{ table: "mappingProfiles", value }] };
}

// 업로드 미리보기 (ARCHITECTURE §6). 반영 전에 행마다 신규·이미 있음·짝 없음·제외를 정한다.
// 읽은 행 = 신규 + 이미 있음 + 짝 없음 + 제외 — 이 검산이 맞지 않으면 버그다.
import { buildIndex } from "../domain/balance";
import { live } from "../domain/ctx";
import type { Data, MatchRule, MappingProfile } from "../schema/entities";
import { isTotalRow } from "./header";
import { parseAmount, parseDate } from "./parse";
import { normalizeKey } from "./text";

export type RowStatus = "new" | "duplicate" | "unmatched" | "excluded";
export type MatchedBy = "rule" | "code" | "name" | "manual";

export interface PlanRow {
  /** 엑셀에서 보이는 행 번호(1부터) */
  line: number;
  date: string | null;
  amount: number | null;
  summary: string;
  vendor: string;
  itemCode: string;
  itemName: string;
  projectName: string;
  uid: string;
  status: RowStatus;
  reason: string;
  itemId: string | null;
  matchedBy: MatchedBy | null;
  dedupeKey: string | null;
  overLimit: boolean;
}

export interface PlanCounts {
  read: number;
  new: number;
  duplicate: number;
  unmatched: number;
  excluded: number;
  overLimit: number;
}

export interface Plan {
  rows: PlanRow[];
  counts: PlanCounts;
  sums: Record<Exclude<RowStatus, "excluded">, number>;
  /** 제외 이유별 건수 */
  excludedBy: Record<string, number>;
}

interface Candidate { itemId: string; code: string; name: string; projectName: string }

function candidates(data: Data, fiscalYearId: string): Candidate[] {
  const idx = buildIndex(data);
  const out: Candidate[] = [];
  for (const it of idx.items.values()) {
    const a = idx.allocations.get(it.allocationId);
    const p = a && idx.projects.get(a.projectId);
    if (!p || p.fiscalYearId !== fiscalYearId || p.status === "closed") continue;
    out.push({ itemId: it.id, code: normalizeKey(it.code), name: normalizeKey(it.name), projectName: normalizeKey(p.name) });
  }
  return out;
}

function narrowByProject(list: Candidate[], projectName: string) {
  if (!projectName || list.length < 2) return list;
  const hit = list.filter((c) => c.projectName === projectName || projectName.includes(c.projectName) || c.projectName.includes(projectName));
  return hit.length ? hit : list;
}

export function matchItem(row: Pick<PlanRow, "summary" | "itemCode" | "itemName" | "projectName">, cands: Candidate[], rules: MatchRule[]):
  { itemId: string; by: MatchedBy } | { itemId: null; reason: string } {
  const valid = new Set(cands.map((c) => c.itemId));
  for (const r of rules) {
    const v = normalizeKey(r.value);
    if (v && valid.has(r.itemId) && normalizeKey(row[r.field]) === v) return { itemId: r.itemId, by: "rule" };
  }
  if (row.itemCode) {
    let hit = cands.filter((c) => c.code && c.code === row.itemCode);
    hit = narrowByProject(hit, row.projectName);
    if (hit.length > 1 && row.itemName) hit = hit.filter((c) => c.name === row.itemName).length ? hit.filter((c) => c.name === row.itemName) : hit;
    if (hit.length === 1) return { itemId: hit[0].itemId, by: "code" };
    if (hit.length > 1) return { itemId: null, reason: `'${row.itemCode}' 코드 항목이 ${hit.length}개` };
  }
  for (const key of [row.itemName, row.itemCode]) {
    if (!key) continue;
    const hit = narrowByProject(cands.filter((c) => c.name === key), row.projectName);
    if (hit.length === 1) return { itemId: hit[0].itemId, by: "name" };
  }
  return { itemId: null, reason: "맞는 항목 없음" };
}

export interface PlanInput {
  rows: string[][];
  headerRow: number;
  columns: MappingProfile["columns"];
  rules: MatchRule[];
  fiscalYear: { id: string; start: string; end: string };
}

export function buildPlan(data: Data, input: PlanInput): Plan {
  const cands = candidates(data, input.fiscalYear.id);
  const idx = buildIndex(data);
  const reverted = new Set(data.uploadBatches.filter((b) => b.revertedAt).map((b) => b.id));
  const existing = new Set(
    live(data.executions).filter((e) => e.dedupeKey && !(e.batchId && reverted.has(e.batchId))).map((e) => e.dedupeKey!),
  );
  const spent = new Map(idx.spentByItem);
  const seen = new Map<string, number>();
  const col = (r: string[], f: keyof PlanInput["columns"]) => {
    const i = input.columns[f];
    return i === undefined ? "" : normalizeKey(r[i] ?? "");
  };

  const rows: PlanRow[] = [];
  for (let i = input.headerRow + 1; i < input.rows.length; i++) {
    const r = input.rows[i];
    if (!r.some((c) => normalizeKey(c))) continue; // 빈 행은 읽은 행으로 세지 않는다
    const rawDate = col(r, "date");
    const rawAmount = col(r, "amount");
    const row: PlanRow = {
      line: i + 1,
      date: parseDate(rawDate),
      amount: parseAmount(rawAmount),
      summary: col(r, "summary"),
      vendor: col(r, "vendor"),
      itemCode: col(r, "itemCode"),
      itemName: col(r, "itemName"),
      projectName: col(r, "projectName"),
      uid: col(r, "uid"),
      status: "excluded", reason: "", itemId: null, matchedBy: null, dedupeKey: null, overLimit: false,
    };
    rows.push(row);

    if (isTotalRow(r) && !row.date) { row.reason = "합계 행"; continue; }
    if (!row.date) { row.reason = rawDate ? `날짜를 읽지 못함('${rawDate}')` : "날짜 없음"; continue; }
    if (row.amount === null) { row.reason = rawAmount ? `금액을 읽지 못함('${rawAmount}')` : "금액 없음"; continue; }
    if (row.amount === 0) { row.reason = "0원"; continue; }
    if (row.date < input.fiscalYear.start || row.date > input.fiscalYear.end) { row.reason = "회계연도 밖"; continue; }

    // 고유번호가 없으면 내용으로 키를 만들고, 같은 파일 안에서 몇 번째인지 붙인다.
    // 같은 날·같은 금액·같은 적요가 진짜로 두 건일 수 있어서다.
    const base = row.uid ? `uid:${row.uid}` : `${row.date}|${row.amount}|${row.summary}|${row.itemCode}|${row.itemName}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    row.dedupeKey = row.uid ? base : `${base}#${n}`;
    if (existing.has(row.dedupeKey)) { row.status = "duplicate"; row.reason = "이미 반영됨"; continue; }

    const m = matchItem(row, cands, input.rules);
    if ("by" in m) {
      row.status = "new";
      row.itemId = m.itemId;
      row.matchedBy = m.by;
    } else {
      row.status = "unmatched";
      row.reason = m.reason;
    }
  }
  return finalize(data, rows, spent);
}

/** 수동 매칭 뒤에도 다시 부른다: 건수·합계·한도 초과를 새로 센다 */
export function finalize(data: Data, rows: PlanRow[], spent = new Map(buildIndex(data).spentByItem)): Plan {
  const idx = buildIndex(data);
  const counts: PlanCounts = { read: rows.length, new: 0, duplicate: 0, unmatched: 0, excluded: 0, overLimit: 0 };
  const sums = { new: 0, duplicate: 0, unmatched: 0 };
  const excludedBy: Record<string, number> = {};
  const running = new Map(spent);
  for (const row of rows) {
    counts[row.status]++;
    row.overLimit = false;
    if (row.status === "excluded") {
      const key = row.reason.replace(/\(.*\)$/, "");
      excludedBy[key] = (excludedBy[key] ?? 0) + 1;
      continue;
    }
    sums[row.status] += row.amount ?? 0;
    if (row.status === "new" && row.itemId) {
      const after = (running.get(row.itemId) ?? 0) + (row.amount ?? 0);
      running.set(row.itemId, after);
      const limit = idx.items.get(row.itemId)?.limit ?? 0;
      if (after > limit) { row.overLimit = true; counts.overLimit++; }
    }
  }
  return { rows, counts, sums, excludedBy };
}

export function assignManually(data: Data, plan: Plan, line: number, itemId: string | null): Plan {
  const rows = plan.rows.map((r) =>
    r.line !== line || (r.status !== "unmatched" && r.matchedBy !== "manual")
      ? r
      : itemId
        ? { ...r, status: "new" as const, itemId, matchedBy: "manual" as const, reason: "" }
        : { ...r, status: "unmatched" as const, itemId: null, matchedBy: null, reason: "맞는 항목 없음" },
  );
  return finalize(data, rows);
}

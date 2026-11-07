// #13 부서에 보낼 "준비할 서류" 표
import { buildIndex } from "../domain/balance";
import { evidenceChecklist, evidenceStateLabel, evidenceTypeLabel, isEvidenceLacking } from "../domain/evidence";
import type { Data } from "../schema/entities";
import { buildWorkbook } from "./xlsx";

export function exportEvidenceChecklist(data: Data, fy: { label: string; start: string; end: string }, now: string, onlyLacking: boolean): Uint8Array {
  const idx = buildIndex(data);
  const dept = new Map(data.departments.map((d) => [d.id, d.name]));
  const exec = new Map(data.executions.map((e) => [e.id, e]));
  const list = evidenceChecklist(data, fy).filter((r) => !onlyLacking || isEvidenceLacking(r.judgement));
  const rows = list.map((r) => {
    const e = exec.get(r.executionId)!;
    const it = r.itemId ? idx.items.get(r.itemId) : undefined;
    const a = it && idx.allocations.get(it.allocationId);
    const p = a && idx.projects.get(a.projectId);
    return [
      e.date, p?.name ?? "(미분류)", a ? dept.get(a.departmentId) ?? "" : "", it?.name ?? "", e.summary, e.amount,
      evidenceStateLabel[r.judgement.state] + (r.judgement.needsFix ? " · 보완 필요" : ""),
      r.judgement.missing.map((t) => evidenceTypeLabel[t]).join(", "),
    ];
  }).sort((x, y) => String(x[2]).localeCompare(String(y[2]), "ko") || String(x[0]).localeCompare(String(y[0])));
  return buildWorkbook(
    [{ name: "증빙 준비 목록", header: ["집행일", "사업", "부서", "항목", "적요", "금액", "상태", "빠진 서류"], rows, moneyCols: [5] }],
    [["회계연도", fy.label], ["내보낸 시각", now], ["범위", onlyLacking ? "미비한 건만" : "전체"], ["건수", rows.length]],
  );
}

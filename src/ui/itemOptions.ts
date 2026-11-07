// 항목 고르기 목록: "사업 › 부서 › 항목". 마감한 사업은 뺀다.
import type { Index } from "../domain/balance";
import type { Data } from "../schema/entities";

export interface ItemOption { id: string; label: string; projectId: string; departmentId: string; closed: boolean }

export function itemOptions(data: Data, idx: Index, fiscalYearId: string | undefined, includeClosed = false): ItemOption[] {
  const dept = new Map(data.departments.map((d) => [d.id, d.name]));
  const out: ItemOption[] = [];
  for (const it of idx.items.values()) {
    const a = idx.allocations.get(it.allocationId);
    const p = a && idx.projects.get(a.projectId);
    if (!a || !p || p.fiscalYearId !== fiscalYearId) continue;
    if (p.status === "closed" && !includeClosed) continue;
    out.push({
      id: it.id, projectId: p.id, departmentId: a.departmentId, closed: p.status === "closed",
      label: `${p.name} › ${dept.get(a.departmentId) ?? "?"} › ${it.name}${it.code && it.code !== it.name ? ` (${it.code})` : ""}`,
    });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label, "ko"));
}

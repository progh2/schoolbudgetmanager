// 잔액·집행률은 저장하지 않고 집행 내역에서 매번 계산한다 (PRD 원칙 3).
import type { Allocation, BudgetItem, Data, Execution, Project } from "../schema/entities";
import { live } from "./ctx";
import { ratio } from "./money";

export interface Index {
  projects: Map<string, Project>;
  allocations: Map<string, Allocation>;
  items: Map<string, BudgetItem>;
  allocationsByProject: Map<string, Allocation[]>;
  itemsByAllocation: Map<string, BudgetItem[]>;
  executionsByItem: Map<string, Execution[]>;
  spentByItem: Map<string, number>;
  unclassified: Execution[];
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export function buildIndex(data: Data): Index {
  const idx: Index = {
    projects: new Map(),
    allocations: new Map(),
    items: new Map(),
    allocationsByProject: new Map(),
    itemsByAllocation: new Map(),
    executionsByItem: new Map(),
    spentByItem: new Map(),
    unclassified: [],
  };
  for (const p of live(data.projects)) idx.projects.set(p.id, p);
  for (const a of live(data.allocations)) {
    idx.allocations.set(a.id, a);
    push(idx.allocationsByProject, a.projectId, a);
  }
  for (const i of live(data.items)) {
    idx.items.set(i.id, i);
    push(idx.itemsByAllocation, i.allocationId, i);
  }
  for (const e of live(data.executions)) {
    if (e.itemId === null || !idx.items.has(e.itemId)) {
      idx.unclassified.push(e);
      continue;
    }
    push(idx.executionsByItem, e.itemId, e);
    idx.spentByItem.set(e.itemId, (idx.spentByItem.get(e.itemId) ?? 0) + e.amount);
  }
  return idx;
}

export interface Summary {
  /** 계획 금액(항목 한도·배정액·사업 총액) */
  budget: number;
  spent: number;
  remaining: number;
  /** 집행률. 계획 금액이 0이면 null */
  rate: number | null;
  /** 집행이 한 건이라도 있는지. 없으면 "집행 없음" */
  executed: boolean;
  executionCount: number;
}

export function itemSummary(idx: Index, item: BudgetItem): Summary {
  const spent = idx.spentByItem.get(item.id) ?? 0;
  const count = idx.executionsByItem.get(item.id)?.length ?? 0;
  return { budget: item.limit, spent, remaining: item.limit - spent, rate: ratio(spent, item.limit), executed: count > 0, executionCount: count };
}

export function allocationSummary(idx: Index, a: Allocation): Summary & { itemLimitSum: number } {
  let spent = 0, count = 0, itemLimitSum = 0;
  for (const it of idx.itemsByAllocation.get(a.id) ?? []) {
    spent += idx.spentByItem.get(it.id) ?? 0;
    count += idx.executionsByItem.get(it.id)?.length ?? 0;
    itemLimitSum += it.limit;
  }
  return { budget: a.amount, spent, remaining: a.amount - spent, rate: ratio(spent, a.amount), executed: count > 0, executionCount: count, itemLimitSum };
}

export function projectSummary(idx: Index, p: Project): Summary & { allocated: number; unallocated: number } {
  let spent = 0, count = 0, allocated = 0;
  for (const a of idx.allocationsByProject.get(p.id) ?? []) {
    const s = allocationSummary(idx, a);
    spent += s.spent;
    count += s.executionCount;
    allocated += a.amount;
  }
  return {
    budget: p.total, spent, remaining: p.total - spent, rate: ratio(spent, p.total),
    executed: count > 0, executionCount: count, allocated, unallocated: p.total - allocated,
  };
}

export interface DepartmentRow {
  departmentId: string;
  allocated: number;
  spent: number;
  remaining: number;
  rate: number | null;
  executed: boolean;
  /** 기준값이 모든 배정에 있을 때만 합계를 낸다. 하나라도 없으면 null */
  basis: number | null;
  perBasis: number | null;
}

/** 한 회계연도 안에서 부서별로 모은다 */
export function departmentRows(idx: Index, fiscalYearId: string): DepartmentRow[] {
  const rows = new Map<string, DepartmentRow & { basisMissing: boolean }>();
  for (const p of idx.projects.values()) {
    if (p.fiscalYearId !== fiscalYearId) continue;
    for (const a of idx.allocationsByProject.get(p.id) ?? []) {
      const s = allocationSummary(idx, a);
      const r = rows.get(a.departmentId) ?? {
        departmentId: a.departmentId, allocated: 0, spent: 0, remaining: 0, rate: null,
        executed: false, basis: 0, perBasis: null, basisMissing: false,
      };
      r.allocated += a.amount;
      r.spent += s.spent;
      r.executed ||= s.executed;
      if (a.basis === null) r.basisMissing = true;
      else r.basis = (r.basis ?? 0) + a.basis;
      rows.set(a.departmentId, r);
    }
  }
  return [...rows.values()].map(({ basisMissing, ...r }) => {
    const basis = basisMissing ? null : r.basis;
    return {
      ...r,
      remaining: r.allocated - r.spent,
      rate: ratio(r.spent, r.allocated),
      basis,
      perBasis: basis ? Math.round(r.allocated / basis) : null,
    };
  });
}

export function projectOfItem(idx: Index, itemId: string): Project | null {
  const item = idx.items.get(itemId);
  const a = item && idx.allocations.get(item.allocationId);
  return (a && idx.projects.get(a.projectId)) ?? null;
}

// 도메인 함수는 시계와 난수를 직접 만지지 않는다. 테스트에서 고정하기 위해 인자로 받는다.
import type { AuditEntry, Write } from "../schema/entities";

export interface Ctx {
  /** ISO 시각 */
  now: string;
  /** YYYY-MM-DD (현지) */
  today: string;
  newId(): string;
}

export type Fail = { ok: false; code: string; message: string };
export type Result<T = { writes: Write[]; id?: string }> = ({ ok: true } & T) | Fail;

export const fail = (code: string, message: string): Fail => ({ ok: false, code, message });

export function auditWrite(
  ctx: Ctx,
  entity: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
  reason = "",
): Write {
  const value: AuditEntry = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    at: ctx.now,
    entity,
    entityId,
    action,
    before: before ?? null,
    after: after ?? null,
    reason,
  };
  return { table: "audit", value };
}

export function live<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

export function realCtx(): Ctx {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    now: d.toISOString(),
    today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    newId: () => crypto.randomUUID(),
  };
}

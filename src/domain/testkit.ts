// 테스트 전용: 고정 시계·순번 id와 명령을 이어 붙이는 도우미.
import { emptyData, type Data } from "../schema/entities";
import { applyWrites } from "./apply";
import type { Ctx, Result } from "./ctx";

export function fixedCtx(today = "2026-04-01"): Ctx {
  let n = 0;
  return { now: `${today}T09:00:00.000Z`, today, newId: () => `id${++n}` };
}

/** 명령을 실행하고 성공하면 반영한다. 실패하면 테스트를 깨뜨린다 */
export function world(today?: string) {
  const ctx = fixedCtx(today);
  let data: Data = emptyData();
  return {
    ctx,
    get data() {
      return data;
    },
    run<I>(cmd: (d: Data, input: I, c: Ctx) => Result, input: I): string {
      const r = cmd(data, input, ctx);
      if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
      data = applyWrites(data, r.writes);
      return r.id ?? "";
    },
    try<I>(cmd: (d: Data, input: I, c: Ctx) => Result, input: I) {
      return cmd(data, input, ctx);
    },
  };
}

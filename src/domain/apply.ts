// 쓰기 목록을 메모리 스냅샷에 반영한다. 스토어가 transact 성공 뒤에 부르고, 테스트도 이걸로 상태를 쌓는다.
import type { Data, Write } from "../schema/entities";

export function applyWrites(data: Data, writes: Write[]): Data {
  const next = { ...data };
  const touched = new Set<string>();
  for (const w of writes) {
    if (!touched.has(w.table)) {
      (next[w.table] as unknown[]) = [...data[w.table]];
      touched.add(w.table);
    }
    const rows = next[w.table] as { id: string }[];
    const i = rows.findIndex((r) => r.id === w.value.id);
    if (i >= 0) rows[i] = w.value;
    else rows.push(w.value);
  }
  return next;
}

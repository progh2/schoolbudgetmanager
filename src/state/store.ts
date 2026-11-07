// 앱 상태. 쓰기 경로는 run() 하나: 도메인 명령 → repo.transact → 메모리 반영.
// 화면은 repo를 직접 만지지 않는다 (imports.test.ts가 지킨다).
import { create } from "zustand";
import { createRepository, requestPersistence } from "../app/boot";
import { applyWrites } from "../domain/apply";
import { buildIndex, type Index } from "../domain/balance";
import { realCtx, type Ctx, type Result } from "../domain/ctx";
import { emptyData, type Data, type StoredFile } from "../schema/entities";
import type { Repository } from "../storage/repository";
import { loadMeta, saveMeta, type Meta } from "./meta";

type Cmd<I, R> = (data: Data, input: I, ctx: Ctx) => Result<R>;

interface State {
  status: "loading" | "ready" | "error";
  error: string | null;
  repo: Repository | null;
  data: Data;
  idx: Index;
  meta: Meta;
  persisted: boolean | null;
  boot(): Promise<void>;
  run<I, R extends { writes: import("../schema/entities").Write[] }>(cmd: Cmd<I, R>, input: I): Promise<Result<R>>;
  setMeta(patch: Partial<Meta>): void;
  saveFile(file: StoredFile): Promise<void>;
  readFile(id: string): Promise<StoredFile | null>;
  allFiles(): Promise<StoredFile[]>;
  replaceAll(data: Data, files: StoredFile[]): Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  status: "loading",
  error: null,
  repo: null,
  data: emptyData(),
  idx: buildIndex(emptyData()),
  meta: loadMeta(),
  persisted: null,

  async boot() {
    try {
      const repo = createRepository();
      const data = await repo.loadAll();
      set({ repo, data, idx: buildIndex(data), status: "ready" });
      requestPersistence().then((persisted) => set({ persisted })).catch(() => set({ persisted: null }));
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  async run(cmd, input) {
    const { repo, data } = get();
    if (!repo) return { ok: false, code: "not_ready", message: "아직 불러오는 중이에요." };
    const r = cmd(data, input, realCtx());
    if (!r.ok) return r;
    try {
      await repo.transact(r.writes);
    } catch (e) {
      return { ok: false, code: "storage", message: `저장하지 못했어요: ${e instanceof Error ? e.message : e}` };
    }
    // 저장하는 사이 다른 쓰기가 끼었을 수 있으니 최신 스냅샷에 반영한다
    const next = applyWrites(get().data, r.writes);
    set({ data: next, idx: buildIndex(next) });
    return r;
  },

  setMeta(patch) {
    const meta = { ...get().meta, ...patch };
    saveMeta(meta);
    set({ meta });
  },

  async saveFile(file) {
    await get().repo!.files.save(file);
  },
  async readFile(id) {
    return get().repo!.files.read(id);
  },
  async allFiles() {
    return get().repo!.files.list();
  },
  async replaceAll(data, files) {
    await get().repo!.replaceAll(data, files);
    set({ data, idx: buildIndex(data) });
  },
}));

/** 지금 보는 회계연도. 고른 것이 없으면 가장 최근 것 */
export function useFiscalYear() {
  const { data, meta } = useStore();
  const years = data.fiscalYears.filter((f) => !f.deletedAt).sort((a, b) => b.start.localeCompare(a.start));
  return years.find((f) => f.id === meta.fiscalYearId) ?? years[0] ?? null;
}

import { useEffect, useState, type ReactNode } from "react";
import { autoBackupOnOpen, getDir, writeBackup } from "../../app/autoBackup";
import { useFiscalYear, useStore } from "../../state/store";
import { daysBetween } from "../../domain/dates";
import { realCtx } from "../../domain/ctx";

export const NAV = [
  { path: "", label: "대시보드" },
  { path: "projects", label: "목적사업" },
  { path: "executions", label: "집행" },
  { path: "upload", label: "에듀파인 업로드" },
  { path: "evidence", label: "증빙" },
  { path: "revisions", label: "변경안·추경" },
  { path: "settings", label: "설정·백업" },
];

function BackupBadge() {
  const { meta, data } = useStore();
  const today = realCtx().today;
  const hasData = data.projects.length > 0;
  if (!meta.lastBackupAt)
    return <a href="#/settings" className={`text-xs ${hasData ? "text-amber-700" : "text-stone-500"}`}>백업한 적 없음</a>;
  const days = daysBetween(meta.lastBackupAt.slice(0, 10), today);
  return (
    <a href="#/settings" className={`text-xs ${days >= 7 ? "font-semibold text-amber-700" : "text-stone-500"}`}>
      마지막 백업 {days === 0 ? "오늘" : `${days}일 전`}
    </a>
  );
}

/** 앱을 열 때 자동 백업. 폴더 권한이 풀렸으면 한 번 눌러 다시 허락받는다(브라우저가 클릭 없이는 묻지 못한다) */
function AutoBackupNudge() {
  const [state, setState] = useState<"idle" | "need" | "saved" | "error">("idle");
  useEffect(() => {
    autoBackupOnOpen().then((r) => setState(r === "need_permission" ? "need" : r === "saved" ? "saved" : "idle")).catch(() => setState("error"));
  }, []);
  if (state === "idle") return null;
  if (state === "saved") return null;
  if (state === "error")
    return <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">자동 백업 폴더에 쓰지 못했어요. <a className="underline" href="#/settings">설정</a>에서 폴더를 다시 골라 주세요.</div>;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      오늘 자동 백업을 하려면 폴더 쓰기를 다시 허락해 주세요.{" "}
      <button type="button" className="underline" onClick={async () => {
        const dir = await getDir();
        if (dir && (await (dir as unknown as { requestPermission(o: object): Promise<string> }).requestPermission({ mode: "readwrite" })) === "granted") {
          await writeBackup(dir as Parameters<typeof writeBackup>[0]);
          setState("saved");
        }
      }}>허락하고 백업</button>
    </div>
  );
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const { data, meta, setMeta, persisted } = useStore();
  const fy = useFiscalYear();
  const years = data.fiscalYears.filter((f) => !f.deletedAt).sort((a, b) => b.start.localeCompare(a.start));
  const today = realCtx().today;
  const stale = data.projects.length > 0 && (!meta.lastBackupAt || daysBetween(meta.lastBackupAt.slice(0, 10), today) >= 7);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="flex flex-wrap items-center gap-4 border-b border-stone-200 bg-white px-4 py-2">
        <a href="#/" className="font-bold text-emerald-900">예산지기</a>
        {years.length > 0 && (
          <select aria-label="회계연도" className="input py-1" value={fy?.id ?? ""} onChange={(e) => setMeta({ fiscalYearId: e.target.value })}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.label} 회계연도</option>)}
          </select>
        )}
        <span className="flex-1" />
        <BackupBadge />
      </header>
      <div className="flex">
        <nav aria-label="메뉴" className="sticky top-0 hidden h-screen w-44 shrink-0 border-r border-stone-200 bg-white p-2 md:block">
          {NAV.map((n) => (
            <a key={n.path} href={`#/${n.path}`}
              className={`block rounded px-3 py-2 text-sm ${route === n.path ? "bg-emerald-50 font-semibold text-emerald-900" : "hover:bg-stone-100"}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
          <nav className="flex flex-wrap gap-1 md:hidden">
            {NAV.map((n) => <a key={n.path} href={`#/${n.path}`} className="rounded border px-2 py-1 text-xs">{n.label}</a>)}
          </nav>
          <AutoBackupNudge />
          {persisted === false && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              이 브라우저가 저장 공간 유지를 허락하지 않았어요. 공간이 부족하면 데이터가 지워질 수 있으니 백업을 자주 내보내 주세요.
            </div>
          )}
          {stale && route !== "settings" && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              데이터는 이 브라우저에만 있어요. {meta.lastBackupAt ? "일주일 넘게 백업하지 않았어요." : "아직 한 번도 백업하지 않았어요."} <a className="underline" href="#/settings">지금 백업하기</a>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

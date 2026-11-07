// 설정 화면의 자동 백업 폴더 (#17). 브라우저가 폴더 쓰기를 지원하지 않으면 수동 백업을 안내한다.
import { useEffect, useState } from "react";
import { autoBackupSupported, forgetDir, getDir, pickDir, writeBackup } from "../../app/autoBackup";
import { Banner, Button } from "./ui";

export function AutoBackup() {
  const [dirName, setDirName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  useEffect(() => {
    getDir().then((d) => setDirName(d?.name ?? null)).catch(() => setDirName(null));
  }, []);

  if (!autoBackupSupported())
    return <p className="text-sm text-stone-500">자동 백업 폴더는 Chrome·Edge에서만 쓸 수 있어요. 이 브라우저에서는 '백업 내려받기'를 자주 눌러 주세요.</p>;

  async function choose() {
    try {
      const dir = await pickDir();
      setDirName(dir.name);
      const name = await writeBackup(dir);
      setMsg({ tone: "ok", text: `'${dir.name}' 폴더에 ${name}을 저장했어요. 앞으로 앱을 열 때 하루 한 번 저장하고 최근 14개만 남겨요.` });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMsg({ tone: "error", text: `폴더에 쓰지 못했어요(${e instanceof Error ? e.message : e}).` });
    }
  }
  async function now() {
    const dir = await getDir();
    if (!dir) return;
    try {
      if ((await dir.requestPermission({ mode: "readwrite" })) !== "granted") return setMsg({ tone: "warn", text: "폴더 쓰기를 허락하지 않았어요." });
      setMsg({ tone: "ok", text: `${await writeBackup(dir)}을 저장했어요.` });
    } catch (e) {
      setMsg({ tone: "error", text: `폴더에 쓰지 못했어요(${e instanceof Error ? e.message : e}). 폴더를 다시 골라 주세요.` });
    }
  }

  return (
    <div className="space-y-2 rounded border border-stone-200 bg-white p-3 text-sm">
      <div className="font-medium">자동 백업 폴더</div>
      <p className="text-stone-600">USB·NAS·학교 드라이브 동기화 폴더처럼 이 브라우저 밖의 폴더를 고르면, 앱을 열 때 하루 한 번 백업 파일을 저장해요.</p>
      <div className="flex flex-wrap items-center gap-2">
        {dirName ? <span>지금 폴더: <b>{dirName}</b></span> : <span className="text-stone-500">고른 폴더 없음</span>}
        <Button onClick={choose}>{dirName ? "폴더 바꾸기" : "폴더 고르기"}</Button>
        {dirName && <Button onClick={now}>지금 저장</Button>}
        {dirName && <Button kind="ghost" className="text-stone-500" onClick={async () => { await forgetDir(); setDirName(null); }}>자동 백업 끄기</Button>}
      </div>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
    </div>
  );
}

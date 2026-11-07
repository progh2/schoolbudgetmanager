import { useState } from "react";
import { createFiscalYear, defaultFiscalYear, saveDepartment } from "../../domain/commands";
import { realCtx } from "../../domain/ctx";
import { schoolYearOf } from "../../domain/dates";
import { useStore } from "../../state/store";
import { Banner, Button, Field, useFlash } from "../components/ui";

export function FirstRun() {
  const run = useStore((s) => s.run);
  const [year, setYear] = useState(String(schoolYearOf(realCtx().today)));
  const [depts, setDepts] = useState("교무기획부\n교육과정부\n학생생활안전부\n정보교육부\n행정실");
  const { flash, setFlash } = useFlash();

  async function start() {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000) return setFlash({ tone: "error", text: "연도를 숫자로 적어 주세요." });
    const r = await run(createFiscalYear, defaultFiscalYear(y));
    if (!r.ok) return setFlash({ tone: "error", text: r.message });
    for (const name of depts.split("\n").map((s) => s.trim()).filter(Boolean)) await run(saveDepartment, { name });
    location.hash = "#/projects";
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold">처음 쓰시는군요</h1>
      <Banner>
        예산지기는 서버 없이 <b>이 브라우저에만</b> 저장해요. 시크릿 창에서는 창을 닫으면 사라지니 일반 창에서 써 주세요.
        다른 PC에서 쓰던 자료가 있으면 <a className="underline" href="#/settings">설정·백업</a>에서 백업 파일을 가져오세요.
      </Banner>
      <Field label="회계연도 (3월 1일 ~ 이듬해 2월 말일)">
        <input className="input w-32" value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
      <Field label="부서 (한 줄에 하나, 나중에 고칠 수 있어요)">
        <textarea className="input h-40" value={depts} onChange={(e) => setDepts(e.target.value)} />
      </Field>
      {flash}
      <Button kind="primary" onClick={start}>시작하기</Button>
    </div>
  );
}

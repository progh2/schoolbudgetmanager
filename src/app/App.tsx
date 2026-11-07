import { useEffect } from "react";
import { useStore } from "../state/store";
import { Layout } from "../ui/components/Layout";
import { Banner } from "../ui/components/ui";
import { Dashboard } from "../ui/screens/Dashboard";
import { Executions } from "../ui/screens/Executions";
import { FirstRun } from "../ui/screens/FirstRun";
import { ProjectDetail } from "../ui/screens/ProjectDetail";
import { Projects } from "../ui/screens/Projects";
import { Settings } from "../ui/screens/Settings";
import { useRoute } from "./router";
import { Upload } from "../ui/screens/Upload";
import { EvidenceScreen } from "../ui/screens/Evidence";
import { Revisions } from "../ui/screens/Revisions";

export function App() {
  const { status, error, boot, data } = useStore();
  const route = useRoute();
  useEffect(() => {
    boot();
  }, [boot]);

  if (status === "loading") return <div className="p-8 text-sm text-stone-500">불러오는 중…</div>;
  if (status === "error")
    return (
      <div className="p-8">
        <Banner tone="error">
          브라우저 저장소를 열지 못했어요({error}). 시크릿 창이거나 저장소가 꺼져 있을 수 있어요. 일반 창에서 다시 열어 주세요.
        </Banner>
      </div>
    );

  const [head = "", id] = route;
  if (data.fiscalYears.filter((f) => !f.deletedAt).length === 0 && head !== "settings")
    return <Layout route={head}><FirstRun /></Layout>;

  let screen;
  if (head === "projects" && id) screen = <ProjectDetail id={id} />;
  else if (head === "projects") screen = <Projects />;
  else if (head === "executions") screen = <Executions />;
  else if (head === "upload") screen = <Upload />;
  else if (head === "evidence") screen = <EvidenceScreen />;
  else if (head === "revisions") screen = <Revisions openId={id} />;
  else if (head === "settings") screen = <Settings />;
  else screen = <Dashboard />;
  return <Layout route={head}>{screen}</Layout>;
}

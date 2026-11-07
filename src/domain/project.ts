// 사업 상태기계 (ARCHITECTURE §5). 전이는 여기서만 결정한다.
//   planning ─start→ operating ─close→ closed ─reopen(사유)→ operating
// closed는 읽기 전용이지만 reopen이 출구라 막다른 상태가 아니다.
import type { Project } from "../schema/entities";

export type ProjectAction = "start" | "close" | "reopen";

const TABLE: Record<Project["status"], Partial<Record<ProjectAction, Project["status"]>>> = {
  planning: { start: "operating" },
  operating: { close: "closed" },
  closed: { reopen: "operating" },
};

export const PROJECT_STATUS_LABEL: Record<Project["status"], string> = {
  planning: "계획",
  operating: "운영",
  closed: "마감",
};

export const PROJECT_ACTION_LABEL: Record<ProjectAction, string> = {
  start: "운영 시작",
  close: "마감",
  reopen: "다시 열기",
};

export function nextProjectStatus(from: Project["status"], action: ProjectAction): Project["status"] | null {
  return TABLE[from][action] ?? null;
}

export function allowedProjectActions(from: Project["status"]): ProjectAction[] {
  return Object.keys(TABLE[from]) as ProjectAction[];
}

export const actionNeedsReason = (a: ProjectAction) => a === "reopen";

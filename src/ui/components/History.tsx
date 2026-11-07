// "누가 언제 무엇을 바꿨나"를 화면에 보여 준다. 단일 사용자 단계라 '누가'는 이 브라우저다.
import { useState } from "react";
import { useStore } from "../../state/store";
import { Section } from "./ui";

const ACTION: Record<string, string> = {
  create: "만듦", update: "고침", delete: "지움", restore: "되돌림", regulations: "규정 첨부 변경",
  "status:start": "운영 시작", "status:close": "마감", "status:reopen": "다시 열기",
  "revision:submit": "제출", "revision:confirm": "확정", "revision:reject": "반려", "revision:cancel": "취소", "revision:withdraw": "작성 중으로 되돌림",
  "upload:apply": "업로드 반영", "upload:revert": "업로드 되돌림", review: "증빙 검토", assign: "항목 연결",
};
const ENTITY: Record<string, string> = {
  project: "사업", allocation: "배정", item: "항목", execution: "집행", evidence: "증빙", revision: "변경안", uploadBatch: "업로드", department: "부서", fiscalYear: "회계연도",
};

function describe(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = ["name", "amount", "total", "limit", "status", "dueDate", "memo", "itemId"].filter((k) => k in a && k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const f = (v: unknown) => (typeof v === "number" ? v.toLocaleString("ko-KR") : String(v ?? "없음"));
  return keys.map((k) => `${k}: ${f(b[k])} → ${f(a[k])}`).join(", ");
}

export function History({ entityIds }: { entityIds: string[] }) {
  const audit = useStore((s) => s.data.audit);
  const [all, setAll] = useState(false);
  const ids = new Set(entityIds);
  const rows = audit.filter((e) => ids.has(e.entityId)).sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Section title="변경 이력">
      <ul className="space-y-1 text-sm">
        {shown.map((e) => (
          <li key={e.id} className="text-stone-700">
            <span className="tabular-nums text-stone-500">{new Date(e.at).toLocaleString("ko-KR")}</span>{" "}
            {ENTITY[e.entity] ?? e.entity} {ACTION[e.action] ?? e.action}
            {describe(e.before, e.after) && <span className="text-stone-500"> ({describe(e.before, e.after)})</span>}
            {e.reason && <span> — 사유: {e.reason}</span>}
          </li>
        ))}
      </ul>
      {rows.length > 10 && !all && <button type="button" className="text-sm text-emerald-800 underline" onClick={() => setAll(true)}>{rows.length - 10}건 더 보기</button>}
    </Section>
  );
}

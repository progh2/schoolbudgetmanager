// 모든 어댑터가 공유하는 엔티티 정의. 백업 가져오기도 이 스키마로 검증한다.
// 금액은 원 단위 정수, 날짜는 ISO 문자열 — Date 객체를 저장하면 비교·정렬이 깨진다.
import { z } from "zod";

export const won = z.number().int();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD");
export const isoTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T/, "시각은 ISO 8601");

const base = {
  id: z.string().min(1),
  createdAt: isoTime,
  updatedAt: isoTime,
  deletedAt: isoTime.nullable().default(null),
};

export const fiscalYearSchema = z.object({
  ...base,
  label: z.string().min(1),
  start: isoDate,
  end: isoDate,
});

export const departmentSchema = z.object({
  ...base,
  name: z.string().min(1),
  order: z.number().int(),
  active: z.boolean(),
});

export const PROJECT_STATUS = ["planning", "operating", "closed"] as const;
export const projectSchema = z.object({
  ...base,
  fiscalYearId: z.string(),
  name: z.string().min(1),
  ownerDepartmentId: z.string().nullable(),
  total: won.nonnegative(),
  status: z.enum(PROJECT_STATUS),
  regulationFileIds: z.array(z.string()),
  memo: z.string(),
});

export const allocationSchema = z.object({
  ...base,
  projectId: z.string(),
  departmentId: z.string(),
  amount: won.nonnegative(),
  /** 기준값(학생 수 등). 있을 때만 "기준값당 배정액"을 보여 준다 */
  basis: z.number().positive().nullable(),
  memo: z.string(),
});

export const EVIDENCE_TYPES = ["official", "proposal", "resolution", "receipt", "etc"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const budgetItemSchema = z.object({
  ...base,
  allocationId: z.string(),
  /** 에듀파인 목·세목 코드나 과목명. 업로드 매칭에 쓴다 */
  code: z.string(),
  name: z.string().min(1),
  limit: won.nonnegative(),
  dueDate: isoDate.nullable(),
  requiredEvidence: z.array(z.enum(EVIDENCE_TYPES)),
});

export const executionSchema = z.object({
  ...base,
  itemId: z.string().nullable(),
  date: isoDate,
  amount: won,
  summary: z.string(),
  vendor: z.string(),
  source: z.enum(["manual", "upload"]),
  batchId: z.string().nullable(),
  dedupeKey: z.string().nullable(),
  overLimitReason: z.string().nullable(),
});

export const REVIEW_STATES = ["pending", "ok", "needs_fix"] as const;
export const evidenceSchema = z.object({
  ...base,
  executionId: z.string(),
  type: z.enum(EVIDENCE_TYPES),
  fileId: z.string(),
  fileName: z.string(),
  review: z.enum(REVIEW_STATES),
  reviewNote: z.string(),
});

export const REVISION_STATUS = ["draft", "in_review", "confirmed", "rejected", "cancelled"] as const;
export const revisionChangeSchema = z.object({
  target: z.enum(["project", "allocation", "item"]),
  targetId: z.string(),
  before: won,
  after: won,
});
export const revisionSchema = z.object({
  ...base,
  projectId: z.string(),
  kind: z.enum(["plan_change", "supplementary"]),
  seq: z.number().int().positive(),
  status: z.enum(REVISION_STATUS),
  changes: z.array(revisionChangeSchema),
  reason: z.string(),
  approval: z
    .object({ approver: z.string().min(1), date: isoDate, note: z.string() })
    .nullable(),
  rejectReason: z.string(),
  copiedFrom: z.string().nullable(),
  confirmedAt: isoTime.nullable(),
});

export const uploadBatchSchema = z.object({
  ...base,
  fileName: z.string(),
  fileHash: z.string(),
  profileId: z.string().nullable(),
  counts: z.object({
    read: z.number().int(),
    created: z.number().int(),
    duplicate: z.number().int(),
    unmatched: z.number().int(),
    excluded: z.number().int(),
    overLimit: z.number().int(),
  }),
  sum: won,
  revertedAt: isoTime.nullable(),
});

export const MAPPING_FIELDS = ["date", "amount", "summary", "itemCode", "itemName", "projectName", "vendor", "uid"] as const;
export type MappingField = (typeof MAPPING_FIELDS)[number];

export const matchRuleSchema = z.object({
  field: z.enum(["summary", "itemCode", "itemName"]),
  value: z.string(),
  itemId: z.string(),
});
export const mappingProfileSchema = z.object({
  ...base,
  name: z.string(),
  headerSignature: z.string(),
  /** 필드 → 열 번호(0부터). 매핑하지 않은 필드는 빠진다 */
  columns: z.partialRecord(z.enum(MAPPING_FIELDS), z.number().int().nonnegative()),
  rules: z.array(matchRuleSchema),
});

export const auditSchema = z.object({
  ...base,
  at: isoTime,
  entity: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string(),
});

export const tableSchemas = {
  fiscalYears: fiscalYearSchema,
  departments: departmentSchema,
  projects: projectSchema,
  allocations: allocationSchema,
  items: budgetItemSchema,
  executions: executionSchema,
  evidences: evidenceSchema,
  revisions: revisionSchema,
  uploadBatches: uploadBatchSchema,
  mappingProfiles: mappingProfileSchema,
  audit: auditSchema,
} as const;

export type TableName = keyof typeof tableSchemas;
export const TABLES = Object.keys(tableSchemas) as TableName[];
export type Tables = { [K in TableName]: z.infer<(typeof tableSchemas)[K]> };

export type FiscalYear = Tables["fiscalYears"];
export type Department = Tables["departments"];
export type Project = Tables["projects"];
export type Allocation = Tables["allocations"];
export type BudgetItem = Tables["items"];
export type Execution = Tables["executions"];
export type Evidence = Tables["evidences"];
export type Revision = Tables["revisions"];
export type RevisionChange = z.infer<typeof revisionChangeSchema>;
export type UploadBatch = Tables["uploadBatches"];
export type MappingProfile = Tables["mappingProfiles"];
export type MatchRule = z.infer<typeof matchRuleSchema>;
export type AuditEntry = Tables["audit"];

/** 앱이 메모리에 들고 있는 전체 스냅샷. 1년치 1만 행 규모라 통째로 들고 계산한다 */
export type Data = { [K in TableName]: Tables[K][] };

export function emptyData(): Data {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Data;
}

/** 쓰기 한 건. 모든 쓰기는 Repository.transact를 거친다 */
export type Write = { [K in TableName]: { table: K; value: Tables[K] } }[TableName];

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

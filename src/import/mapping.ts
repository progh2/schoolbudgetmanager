// 머리글 → 필드 추측. 사용자가 고칠 수 있고, 고친 것은 MappingProfile로 기억한다.
import type { MappingField, MappingProfile } from "../schema/entities";
import { compactKey } from "./text";

export const FIELD_LABEL: Record<MappingField, string> = {
  date: "집행일", amount: "금액", summary: "적요", itemCode: "과목·코드", itemName: "세부 항목명",
  projectName: "사업명", vendor: "거래처", uid: "고유번호",
};
export const REQUIRED_FIELDS: MappingField[] = ["date", "amount"];

const GUESS: [MappingField, string[]][] = [
  ["date", ["집행일자", "지출일자", "결의일자", "지급일자", "집행일", "지출일", "일자", "날짜"]],
  ["amount", ["집행액", "집행금액", "지출액", "지출금액", "결의금액", "지급액", "금액"]],
  ["summary", ["적요", "지출내용", "집행내용", "건명", "내용"]],
  ["itemCode", ["세목", "통계목", "과목코드", "예산과목", "과목", "목"]],
  ["itemName", ["세부항목", "세세목", "산출내역", "항목"]],
  ["projectName", ["세부사업", "사업명", "단위사업", "사업"]],
  ["vendor", ["거래처", "지급처", "채주", "상호", "업체"]],
  ["uid", ["지출결의번호", "결의번호", "지출번호", "원인행위번호", "전표번호"]],
];

export type Columns = MappingProfile["columns"];

export function guessColumns(header: string[]): Columns {
  const keys = header.map(compactKey);
  const used = new Set<number>();
  const out: Columns = {};
  for (const exact of [true, false]) {
    for (const [field, words] of GUESS) {
      if (out[field] !== undefined) continue;
      for (const w of words) {
        const i = keys.findIndex((k, j) => !used.has(j) && k && (exact ? k === w : k.includes(w)));
        if (i >= 0) { out[field] = i; used.add(i); break; }
      }
    }
  }
  return out;
}

export const headerSignature = (header: string[]) => header.map(compactKey).join("|");

export function findProfile(profiles: MappingProfile[], header: string[]): MappingProfile | null {
  const sig = headerSignature(header);
  return profiles.filter((p) => !p.deletedAt && p.headerSignature === sig).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

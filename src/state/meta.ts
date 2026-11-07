// 데이터가 아닌 앱 설정(지금 보는 회계연도, 마지막 백업 시각). 백업에 넣지 않는다.
const KEY = "yesanjigi:meta";

export interface Meta {
  fiscalYearId: string | null;
  lastBackupAt: string | null;
  lastAutoBackupDay: string | null;
}

export function loadMeta(): Meta {
  try {
    return { fiscalYearId: null, lastBackupAt: null, lastAutoBackupDay: null, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { fiscalYearId: null, lastBackupAt: null, lastAutoBackupDay: null };
  }
}

export function saveMeta(m: Meta) {
  localStorage.setItem(KEY, JSON.stringify(m));
}

// 자동 백업 파일 이름과 보존 개수 (#17)
export const AUTO_PREFIX = "예산지기-자동-";
export const KEEP = 14;
const PATTERN = /^예산지기-자동-(\d{4}-\d{2}-\d{2})\.yesan\.zip$/;

export const autoBackupName = (today: string) => `${AUTO_PREFIX}${today}.yesan.zip`;

/** 지울 파일 이름: 자동 백업 꼴만 보고, 날짜 최신 KEEP개를 남긴다. 사람이 만든 파일은 건드리지 않는다 */
export function namesToPrune(names: string[], keep = KEEP): string[] {
  return names.filter((n) => PATTERN.test(n)).sort().reverse().slice(keep);
}

export const dueForAutoBackup = (lastDay: string | null, today: string) => lastDay !== today;

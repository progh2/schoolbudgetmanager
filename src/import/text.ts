// 조인 키 정리: 앞뒤 공백, 줄바꿈 없는 공백(U+00A0), 전각 문자, 연속 공백.
// 눈에 안 보이는 차이로 매칭이 깨지는 것을 막는다.
export function normalizeKey(s: string): string {
  return s.normalize("NFKC").replace(/[ ​﻿]/g, " ").replace(/\s+/g, " ").trim();
}

/** 머리글 비교용: 공백까지 모두 뺀다 */
export const compactKey = (s: string) => normalizeKey(s).replace(/\s/g, "");

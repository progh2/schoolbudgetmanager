# [M7] Firebase 연동 (옵션 — 착수 전 확인)

마일스톤: M7 Firebase · ARCHITECTURE §9

## 할 일
- [ ] `adapters/firebase`(Firestore + Storage), 모든 문서에 `schoolId`
- [ ] 역할(총괄·부서 담당·열람)과 보안 규칙. 화면 숨김이 아니라 규칙이 통제
- [ ] 백업 zip → Firebase 가져오기(병합)

## 완료 기준
- 에뮬레이터 규칙 테스트: 학교 A 사용자가 학교 B 문서를 목록·단건·검색 어디로도 못 읽는다
- 계약 테스트 통과

# [M1] 백업 zip 내보내기·가져오기 + 저장 공간 유지 요청

마일스톤: M1 기본 장부 · ARCHITECTURE §7, §8

## 할 일
- [ ] `backup/export.ts`: `bundle.json` + `files/` → `.yesan.zip`
- [ ] `backup/import.ts`: Zod 검증 → 건수 미리보기 → 현재 데이터 자동 백업 → 교체
- [ ] `schemaVersion`과 `migrations.ts` 자리
- [ ] 첫 실행 `navigator.storage.persist()` 요청, 결과를 설정 화면에 표시
- [ ] 머리글에 "마지막 백업 N일 전" 배지, 7일 넘으면 배너(막지는 않음)
- [ ] 시크릿 창 안내 한 줄

## 완료 기준
- 내보낸 zip을 빈 브라우저 프로필에서 가져오면 모든 엔티티 건수·금액 합·파일 수가 같다(테스트)
- 깨진 zip, 다른 앱 JSON, 미래 schemaVersion은 각각 이유를 한 줄로 말하고 아무것도 바꾸지 않는다

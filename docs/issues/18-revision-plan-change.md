# [M5] 변경안 상태기계 + 계획 변경(총액 불변)

마일스톤: M5 계획 변경·추경 · ARCHITECTURE §5

## 할 일
- [ ] `domain/revision.ts`: `transition()` 하나로 draft·in_review·confirmed·rejected·cancelled
- [ ] 계획 변경 작성 화면: 배정·항목 사이 금액 이동, 총액 불변 검증
- [ ] 승인 기록(승인자 이름·일자·근거 파일). 단일 사용자 단계에서는 기록이지 통제가 아니다
- [ ] 확정 = changes 적용 + 상태 변경을 한 `transact`
- [ ] 반려 → "복사해서 다시 작성"(copiedFrom)

## 완료 기준
- 허용되지 않은 전이 전부 거부(표 기반 테스트)
- 총액이 바뀌는 계획 변경은 저장되지 않는다
- 반려된 변경안에서 새 draft가 만들어진다

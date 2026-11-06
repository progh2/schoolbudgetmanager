# [M1] 저장소 계약 + 메모리·IndexedDB 어댑터 + 계약 테스트

마일스톤: M1 기본 장부 · ARCHITECTURE §3, §4

## 할 일
- [ ] `schema/`: 엔티티 Zod 정의(금액 정수, 날짜 ISO 문자열)
- [ ] `storage/repository.ts`: `CrudRepo`, `Repository`, `transact`
- [ ] `adapters/memory`, `adapters/local`(Dexie, DB 이름 `yesanjigi`)
- [ ] `contract.test.ts`: 두 어댑터에 같은 시나리오
- [ ] `app/boot.ts`: `createRepository()` 한 곳에서 어댑터 선택
- [ ] `adapters/desktop`, `adapters/firebase`는 README만 둔 자리

## 완료 기준
- 계약 테스트: 빈 목록이 `[]`, soft delete 뒤 목록에서 빠지고 `get`으로는 보임, `transact` 중간 실패 시 아무것도 안 써짐, 금액에 소수를 넣으면 거부
- 새로고침 후에도 데이터가 남는다

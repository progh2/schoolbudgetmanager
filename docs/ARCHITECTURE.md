# 예산지기 — 구조

PRD의 원칙 1~3(서버 없음, 저장소 교체, 숫자를 지어내지 않음)을 코드 구조로 옮긴다.

## 1. 기술 선택

| 무엇 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + TypeScript | 금액·날짜 타입을 컴파일러가 잡는다. `npm run build`가 머지 게이트 |
| 화면 | React | 표·폼이 많은 관리 화면. techerplz와 같은 구성 |
| 상태 | Zustand | 스토어는 도메인 함수와 Repository만 부른다 |
| 스키마 | Zod | 엔티티 정의 하나로 타입 + 백업 가져오기 검증 |
| 저장 | Dexie (IndexedDB) | 인덱스·트랜잭션. 손으로 짠 IndexedDB 래퍼보다 짧다 |
| 엑셀 | SheetJS | 읽기·쓰기 모두. **npm 레지스트리판(0.18.x)은 낡았으니 cdn.sheetjs.com 타르볼로 설치** |
| zip | fflate | 백업 파일 |
| 테스트 | Vitest + fake-indexeddb | 도메인 순수 함수, 저장소 계약, 엑셀 파이프라인 |
| 스타일 | Tailwind CSS 4 | |

## 2. 계층

```
src/
├── domain/     순수 함수. 금액 계산, 검증, 상태기계, 매칭, 점검. React·Dexie를 모른다
├── schema/     Zod 엔티티 정의와 타입 (모든 어댑터가 공유하는 계약)
├── storage/    Repository 계약 + 어댑터
│   ├── repository.ts
│   ├── contract.test.ts     모든 어댑터에 같은 테스트를 돌린다
│   └── adapters/
│       ├── memory/          테스트용
│       ├── local/           M1: IndexedDB(Dexie)
│       ├── desktop/         M6 자리
│       └── firebase/        M7 자리
├── import/     엑셀·CSV 읽기, 헤더 찾기, 열 매핑, 중복 키 (domain처럼 순수)
├── backup/     zip 내보내기·가져오기, 자동 백업 폴더
├── state/      Zustand 스토어
├── ui/         화면 (screens/, components/)
└── app/        해시 라우터, 앱 시작(어댑터 선택)
```

규칙: `domain/`·`import/`는 DOM과 저장소를 import하지 않는다(`imports.test.ts`로 고정). 화면은 스토어만, 스토어는 도메인과 Repository만 부른다.

## 3. Repository 계약

```ts
interface Repository {
  readonly kind: 'memory' | 'local' | 'desktop' | 'firebase'
  list<K extends TableName>(table: K): Promise<Tables[K][]>   // 없으면 [] (null 금지). 지운 것 포함
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>
  /** 쓰기의 유일한 입구. 전부 쓰이거나 하나도 안 쓰인다 */
  transact(writes: Write[]): Promise<void>
  loadAll(): Promise<Data>
  replaceAll(data: Data, files: StoredFile[]): Promise<void>   // 백업 가져오기 전용
  files: { save, read, list, remove }
}
```

- 모든 메서드는 Promise. IndexedDB도 Firestore도 비동기라 처음부터 맞춘다
- 어댑터 선택은 `app/boot.ts`의 `createRepository()` 한 곳
- **계약 테스트**: `storage/contract.test.ts`가 memory·local 어댑터에 같은 시나리오를 돌린다(빈 목록이 `[]`, soft delete한 행도 `get`으로 읽힘, transact 중간 실패 시 아무것도 안 써짐, 소수 금액 거부). 새 어댑터는 이 테스트를 통과해야 들어온다
- **쓰기는 한 곳으로**: 도메인 명령(`domain/commands.ts` 등)은 순수 함수 `(data, input, ctx) → { writes } | 실패`다. 검증과 감사 기록이 여기서 만들어진다. 스토어의 `run()`만 `repo.transact`를 부르고(`imports.test.ts`가 grep으로 고정), 성공하면 메모리 스냅샷에 반영한다
- 1년치(집행 1만 행) 규모라 앱은 시작할 때 전부 메모리에 올리고 계산한다. 소프트 삭제(`deletedAt`)로 지우고, 목록·계산은 `live()`로 거른다

## 4. 데이터 모델

공통 필드: `id`(UUID 문자열), `createdAt`, `updatedAt`, `deletedAt?`. 금액은 **원 단위 정수**(`z.number().int()`), 날짜는 **ISO 문자열**(`"2026-03-01"`). `Date` 객체를 그대로 저장하지 않는다.

| 엔티티 | 주요 필드 |
|---|---|
| FiscalYear | `label`("2026"), `start`, `end` |
| Department | `name`, `order`, `active` |
| Project | `fiscalYearId`, `name`, `ownerDepartmentId`, `total`, `status: planning\|operating\|closed`, `regulationFileIds[]`, `memo` |
| Allocation | `projectId`, `departmentId`, `amount`, `basis?`(기준값: 학생 수 등, 있을 때만 비교 화면에 비율 표시), `memo` |
| BudgetItem | `allocationId`, `code?`(에듀파인 목·세목), `name`, `limit`, `dueDate?`, `requiredEvidence[]` |
| Execution | `itemId \| null`, `date`, `amount`, `summary`(적요), `vendor?`, `source: manual\|upload`, `batchId?`, `dedupeKey?`, `overLimitReason?` |
| Evidence | `executionId`, `type`, `fileId`, `fileName`, `review: pending\|ok\|needs_fix`, `reviewNote?` |
| Revision | `projectId`, `kind: plan_change\|supplementary`, `seq`(n차), `status`, `changes[]`(대상 id, 전, 후), `reason`, `approval?`(승인자 이름·일자·근거 파일), `copiedFrom?` |
| UploadBatch | `fileName`, `fileHash`, `profileId`, `counts`(신규·중복·짝 없음·한도 초과), `sum`, `appliedAt`, `revertedAt?` |
| MappingProfile | `name`, `headerSignature`(헤더 문자열 묶음), `columns`(필드 → 열), `rules[]`(적요·코드 → 항목) |
| AuditEntry | `at`, `entity`, `entityId`, `action`, `before?`, `after?`, `reason?` |

### 계산하는 값 (저장하지 않는다)

| 값 | 정의 | 데이터 없음 |
|---|---|---|
| 항목 잔액 | `limit − Σ executions(itemId, deletedAt 없음)` | 집행 0건이면 "집행 없음", 잔액 = 한도 |
| 집행률 | `Σ 집행 / 배정액` (분모를 같이 보여 준다) | 배정 0원이면 비율 없음("배정 없음") |
| 미배정액 | `project.total − Σ allocations.amount` | |
| 증빙 상태 | 필수 유형 중 붙은 것의 수 → 없음/일부/완비 | 필수 유형이 없으면 "필수 없음" |

## 5. 상태기계

### 사업
```
planning ──운영 시작──▶ operating ──마감──▶ closed
                          ▲                   │
                          └──다시 열기(사유)───┘
```
- `operating`에서 배정·항목 금액은 Revision 확정으로만 바뀐다
- `closed`는 읽기 전용이지만 막다른 곳이 아니다: "다시 열기"가 출구다

### 변경안 (Revision)
```
draft ──제출──▶ in_review ──확정──▶ confirmed
  │               │
  │               └──반려(사유)──▶ rejected ──복사해서 다시 작성──▶ (새 draft)
  └──취소──▶ cancelled
```
- 전이는 `domain/revision.ts`의 `transition(revision, action)` 하나에서만. 허용되지 않은 전이는 예외
- 모든 전이는 AuditEntry를 쓴다
- `confirmed`는 되돌리지 않는다. 반대 방향 변경안이 출구다
- 확정 = 변경안의 `changes[]`를 배정·항목에 적용 + 상태 변경을 **한 transact**로

## 6. 에듀파인 업로드 파이프라인

```
파일 → 인코딩 판별(UTF-8/CP949, 실패하면 멈추고 알림)
     → 시트 읽기(모든 셀 텍스트로) → 병합 셀 채우기 → 헤더 행 찾기
     → MappingProfile 고르기(headerSignature) 또는 열 매핑 화면
     → 행 변환(금액 정수, 날짜 ISO; 연도 없는 날짜는 거부)
     → 항목 매칭(코드 → 규칙 → 수동) → 중복 키 → 미리보기
     → 확정: UploadBatch + Execution들을 한 transact로
```

- **중복 키**: 매핑에 고유번호 열(지출결의번호 등)이 있으면 그것. 없으면 `날짜|금액|적요|항목코드` + **같은 파일 안에서 몇 번째인지**. 같은 날 같은 금액 같은 적요가 진짜로 두 건일 수 있어서 순번을 붙인다
- 미리보기는 "읽은 행 = 신규 + 이미 있음 + 짝 없음 + 제외"가 맞아떨어지는지 보여 준다. 제외한 행은 이유와 함께 센다
- 한도 초과 행도 반영한다(에듀파인이 기준). 대신 표시하고 대시보드 경고로 넘긴다
- 되돌리기: 배치의 Execution을 soft delete하고 `revertedAt`을 찍는다

## 7. 배포 — GitHub Pages와 BizCoder Pod

**같은 `dist/` 하나로 둘 다 돈다.** 이를 위해:

- `vite.config.ts`에 `base: './'` (상대 경로). Pages의 `/<저장소>/` 하위 경로든 Pod의 루트든 그대로 된다
- 라우팅은 **해시**(`#/projects`). 서버 설정 없이 새로고침해도 404가 나지 않는다
- 서버에 기대는 기능을 넣지 않는다(서버 세션, 서버 시크릿, 서버 API)

| | GitHub Pages | BizCoder Pod |
|---|---|---|
| 올리는 법 | `main` 푸시 → `.github/workflows/deploy.yml`이 테스트 → 빌드 → 배포 | `npm run build` 후 `dist/`를 정적 사이트로 배포 |
| 최초 설정 | Settings → Pages → Source를 **GitHub Actions**로 | 배포 범위 선택 (`tenant`면 회사 계정 로그인 뒤에만 열린다) |
| 주소 | `https://progh2.github.io/schoolbudgetmanager/` | Pod가 주는 주소 |

### 알아 둘 것 (데이터는 출처(origin)별로 따로 산다)

- IndexedDB는 **origin 단위**다. Pages 주소와 Pod 주소는 서로 다른 저장소다. 한쪽에서 쓰던 데이터는 백업 zip으로 옮긴다
- `progh2.github.io`는 **모든 progh2 Pages 프로젝트가 같은 origin을 쓴다.** 다른 프로젝트 페이지가 같은 IndexedDB를 열 수 있다. DB 이름은 `yesanjigi`로 고정해 겹치지 않게 하고, 실제 운영은 커스텀 도메인이나 Pod를 권한다
- 첫 실행에 `navigator.storage.persist()`를 요청하고 결과를 설정 화면에 보여 준다(거절되면 브라우저가 공간 부족 때 지울 수 있다)
- 시크릿 창에서는 창을 닫으면 사라진다. 첫 화면에 한 줄로 알린다
- Pod `tenant` 배포의 회사 로그인 정보는 서버가 받아 검증해야 쓸 수 있다. 정적 사이트인 1단계는 이를 쓰지 않는다

## 8. 백업 형식

`예산지기-2026-11-07.yesan.zip`
```
bundle.json   { schemaVersion, exportedAt, appVersion, entities: { projects: [...], ... }, audit: [...] }
files/<fileId>  증빙·규정 원본
```
- 가져오기: Zod로 검증 → 건수 미리보기 → **현재 데이터를 자동 백업한 뒤** 교체. 병합 가져오기는 M7 이관 때 만든다
- `schemaVersion`이 올라가면 `backup/migrations.ts`에 이전 버전 변환을 추가한다(테스트 포함)
- 이 형식이 로컬 → 데스크톱 → Firebase 이관 통로다

## 9. 확장

- **M6 데스크톱**: Tauri로 같은 `dist/`를 감싼다. `desktop` 어댑터는 SQLite 또는 JSON + 파일 폴더. 계약 테스트 통과가 조건
- **M7 Firebase**: Firestore 컬렉션은 엔티티와 1:1, 모든 문서에 `schoolId`. 보안 규칙에서 `schoolId`와 역할로 읽기·쓰기를 거른다(화면에서 숨기는 것은 통제가 아니다). 학교 구분을 이메일 도메인으로 하지 않는다. 학교 A 사용자가 학교 B 문서를 못 읽는 규칙 테스트(에뮬레이터)가 완료 기준

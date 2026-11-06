# 예산지기 (schoolbudgetmanager) — 작업 규칙

학교 목적사업 예산 관리 웹앱. 서버·로그인 없음, 데이터는 브라우저(IndexedDB)에만.
Vite + React + TypeScript. 기획 `docs/PRD.md`, 구조 `docs/ARCHITECTURE.md`, 이슈 `docs/issues/`.

## 컨텍스트 앵커
- intent: M0 — BizCoder 초안(v0.1)을 PRD v0.2로 다시 씀. 코드 없음
- next_steps: GitHub 저장소 만들기 → `scripts/push-issues.sh` → #01 프로젝트 초기화부터

## 절차 (반드시)
1. 새 일은 **이슈부터**(한국어). 원격 전에는 `docs/issues/NN-*.md` + `STATUS.md`.
2. **브랜치 → PR → 스쿼시 머지.** main 직접 커밋 금지. 브랜치 이름 `feat/NN-짧은설명`.
3. 머지 전 `npm test`와 `npm run build` 둘 다 통과, 경고 0.
4. 머지 후 `docs/PROCESS.md`에 **왜 그렇게 했는지** 한 단락(이슈 번호 붙여).
5. 커밋: `feat(영역): 한국어 요약 (#번호)`. 영역은 domain·storage·import·backup·ui·infra·docs.

## 코드 규칙
- `domain/`·`import/`는 순수 함수. React·Dexie·storage를 import하지 않는다(`imports.test.ts`).
- 배정·항목·집행 쓰기는 `domain/commands.ts`만. 화면·스토어에서 `repo.*.put` 직접 호출 금지.
- 금액은 원 단위 정수, 날짜는 ISO 문자열. 잔액·집행률은 저장하지 않고 계산한다.
- 데이터 없음은 "0%"가 아니다. 분모가 0이면 비율 대신 이유를 보여 준다.
- `alert`·`confirm`·`prompt` 금지. 화면 안 배너로 묻는다.
- 상태 전이는 전이 함수 하나에서만, 전이마다 AuditEntry.
- 오늘 날짜는 인자로 받는다(`today: string`). 함수 안에서 `new Date()` 하지 않는다.
- 주석·커밋·문서는 한국어, 존재 이유(왜)를 적는다.

## 함정
- **실제 학교 엑셀·증빙·규정 파일을 커밋하지 않는다.** `.gitignore`가 막지만 `git add -A` 전에 `git status`를 본다. 픽스처는 `tests/fixtures/`의 가상 데이터만.
- SheetJS는 npm 레지스트리판(0.18.x)을 쓰지 않는다. cdn.sheetjs.com 타르볼.
- 엑셀은 모두 텍스트로 읽고 직접 변환한다. 자동 형변환은 앞자리 0과 날짜를 망친다.
- `base: './'`와 해시 라우팅을 바꾸면 Pages·Pod 중 하나가 깨진다.
- `progh2.github.io`는 모든 Pages 프로젝트가 같은 origin이다. IndexedDB 이름은 `yesanjigi` 고정.

## 분업
- **직접 한다**: 설계 결정, 원인 모르는 버그, 명세 작성, 최종 검토, 한 줄 수정.
- **implementer(소넷)에게 위임**: 명세가 정해진 구현. 이슈 파일·완료 기준·손댈 파일을 넘긴다.
- **검토는 실물로**: 보고를 믿지 말고 `git diff`를 읽고 `npm test`를 다시 돌린 뒤 커밋. 커밋·PR·머지는 오케스트레이터만.

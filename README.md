# 예산지기 — 학교 목적사업 예산 관리

목적사업 예산을 부서에 나누고, 에듀파인 엑셀로 집행을 맞추고, 증빙·마감·추경을 한곳에서 챙기는 웹앱.
**서버도 로그인도 없다.** 데이터는 쓰는 사람의 브라우저(IndexedDB)에만 남는다.

- 기획: [docs/PRD.md](docs/PRD.md)
- 구조: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 이슈: [docs/issues/](docs/issues/) — 진행 상황은 [docs/issues/STATUS.md](docs/issues/STATUS.md)
- 진행 기록(왜 그렇게 했나): [docs/PROCESS.md](docs/PROCESS.md)

## 지금 되는 것 (1단계 M1~M5)

- **기본 장부**: 회계연도·부서·목적사업, 부서 배정과 예산 항목(한도·사용기한·필수 증빙), 집행 입력, 사업·부서별 현황표와 엑셀
- **사업 상태**: 계획(자유롭게 고침) → 운영(금액 잠김, 변경안으로만) → 마감(읽기 전용, 사유 적고 다시 열기)
- **에듀파인 업로드**: .xlsx·.xls·.csv(UTF-8·CP949), 머리글 자동 찾기, 열 매핑 기억, 미리보기 검산, 중복 없는 재업로드, 짝 없는 행 수동 연결과 규칙 기억, 업로드 되돌리기
- **증빙**: 집행별 파일 첨부, 필수 증빙 판정(없음·일부·완비), 검토(확인·보완 필요), 준비 목록 엑셀, 규정 문서(PDF·HWPX) 낱말 찾기
- **점검·대시보드**: 사용기한 D-14·7·1, 한도 90%·100%·초과 경고와 근거, 증빙 미비, 미분류 집행
- **계획 변경·추경**: 작성 → 제출 → 확정(승인 기록)·반려, 총액 불변·잔액 음수 검증, n차 추경, 확정 직전 숫자 조회
- **백업**: zip(증빙 파일 포함) 내려받기·가져오기, 마지막 백업 배지, 자동 백업 폴더(Chrome·Edge)
- 모든 금액 변경은 변경 이력(언제·무엇을·왜)에 남는다

## 실행

```bash
npm install
npm run dev      # http://localhost:5173/
npm test         # 도메인·저장소 계약·엑셀·백업·구조 규칙 (Vitest)
npm run build    # dist/ (경고 0이어야 한다)
npm run smoke    # 실제 브라우저로 dist/를 하위 경로·루트 두 곳에서 눌러 본다 (Playwright)
```

스모크를 처음 돌릴 때 브라우저가 없으면 `npx playwright install chromium`.

## 배포

`dist/` 하나로 GitHub Pages와 BizCoder Pod 둘 다 된다(`base: './'`, 해시 라우팅, pdf.js 워커도 `.js`).

**GitHub Pages**
1. GitHub에 저장소를 만들고 푸시한다.
2. Settings → Pages → Source를 **GitHub Actions**로 바꾼다.
3. `main`에 푸시하면 `.github/workflows/deploy.yml`이 테스트 → 빌드 → 스모크 → 배포한다. PR에서는 배포 없이 검사만.

**BizCoder Pod**
1. `npm run build`
2. `dist/`를 정적 사이트로 배포한다. 같은 학교 사람만 열게 하려면 범위를 `tenant`로.

Pages 주소와 Pod 주소는 저장소가 따로다. 옮길 때는 설정·백업 → 백업 내려받기 → 다른 주소에서 가져오기.
`progh2.github.io` 아래 다른 Pages 프로젝트와 origin을 같이 쓰니, 실제 운영은 커스텀 도메인이나 Pod를 권한다.

## 이슈를 GitHub로 옮기기

```bash
DRY_RUN=1 scripts/push-issues.sh   # 무엇을 만들지 먼저 보기
scripts/push-issues.sh             # 마일스톤 M1~M7 + 이슈 21개 (이미 있는 제목은 건너뜀)
```

## 구조

```
src/
├── schema/     Zod 엔티티 (모든 어댑터·백업이 공유하는 계약)
├── domain/     순수 함수: 명령(검증+감사 기록 → 쓰기 목록), 잔액, 상태기계, 점검, 증빙 판정, 변경안
├── import/     엑셀·CSV 읽기, 머리글·열 매핑, 미리보기, 규정 문서 글자 뽑기
├── storage/    Repository 계약 + memory·IndexedDB 어댑터 (desktop·firebase 자리)
├── backup/     zip 형식, 자동 백업 보존 규칙
├── export/     엑셀 내보내기
├── state/      Zustand 스토어 — 쓰기는 run() 한 입구
├── ui/         화면
└── app/        시작·라우터·자동 백업 폴더
tests/fixtures/ 가상 에듀파인 CSV(CP949)·규정 PDF·HWPX — 실제 학교 자료는 커밋하지 않는다
scripts/smoke/  Playwright 스모크
```

# [M1] 프로젝트 초기화 + GitHub Pages 배포 파이프라인

마일스톤: M1 기본 장부 · ARCHITECTURE §1, §7

## 할 일
- [ ] Vite + React + TypeScript + Tailwind CSS 4 초기화
- [ ] Vitest, fake-indexeddb 설정
- [ ] Zustand, Zod, Dexie, fflate 설치. SheetJS는 cdn.sheetjs.com 타르볼로
- [ ] `vite.config.ts`에 `base: './'`
- [ ] 해시 라우터와 빈 화면 8개(PRD 「화면」)
- [ ] `imports.test.ts`: `domain/`·`import/`가 react·dexie·storage를 import하지 않음
- [ ] `.github/workflows/deploy.yml`이 `npm ci` → `npm test` → `npm run build` → Pages 배포를 실제로 한다

## 완료 기준
- `npm test`, `npm run build` 성공, 경고 0
- `dist/`를 하위 경로(`/x/`)와 루트(`/`) 두 곳에 `npx serve`로 띄워 둘 다 화면이 뜬다
- main 푸시 시 Pages 주소에서 첫 화면이 열린다

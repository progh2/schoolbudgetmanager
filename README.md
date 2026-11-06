# 예산지기 — 학교 목적사업 예산 관리

목적사업 예산을 부서에 나누고, 에듀파인 엑셀로 집행을 맞추고, 증빙·마감·추경을 한곳에서 챙기는 웹앱.
**서버도 로그인도 없다.** 데이터는 쓰는 사람의 브라우저에만 남는다.

- 기획: [docs/PRD.md](docs/PRD.md)
- 구조: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 이슈: [docs/issues/](docs/issues/) — 진행 상황은 [docs/issues/STATUS.md](docs/issues/STATUS.md)
- 진행 기록: [docs/PROCESS.md](docs/PROCESS.md)

## 지금 단계

M0 설계. 코드는 #01부터 시작한다.

## 실행 (#01 이후)

```bash
npm install
npm run dev     # http://localhost:5173/
npm test
npm run build   # dist/
```

## 배포

`dist/` 하나로 GitHub Pages와 BizCoder Pod 둘 다 된다(`base: './'`, 해시 라우팅).

**GitHub Pages**
1. GitHub에 저장소를 만들고 푸시한다.
2. Settings → Pages → Source를 **GitHub Actions**로 바꾼다.
3. `main`에 푸시하면 `.github/workflows/deploy.yml`이 테스트 → 빌드 → 배포한다.

**BizCoder Pod**
1. `npm run build`
2. `dist/`를 정적 사이트로 배포한다. 같은 학교 사람만 열게 하려면 범위를 `tenant`로.

Pages 주소와 Pod 주소는 저장소가 따로다. 옮길 때는 설정 → 백업 내보내기 → 가져오기.

## 이슈를 GitHub로 옮기기

```bash
gh auth login
DRY_RUN=1 scripts/push-issues.sh   # 무엇을 만들지 먼저 보기
scripts/push-issues.sh             # 마일스톤 M1~M7 + 이슈 21개 생성 (이미 있는 제목은 건너뜀)
```

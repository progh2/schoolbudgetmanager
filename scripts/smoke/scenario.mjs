// 사람이 하는 순서 그대로: 처음 시작 → 사업 → 배정 → 항목 → 운영 시작 → 집행 → 한도 초과 사유 → 대시보드 → 백업
import { expect } from "playwright/test";

export async function scenario(page, base, shot, full) {
  await page.goto(base);
  await expect(page.getByText("처음 쓰시는군요")).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page).toHaveURL(/#\/projects/);
  if (!full) return page.screenshot({ path: `${shot}-projects.png` });

  await page.getByRole("button", { name: "새 사업" }).click();
  await page.getByPlaceholder("예: 방과후학교 운영").fill("방과후학교 운영");
  await page.getByPlaceholder("10,000,000").fill("10000000");
  await page.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("heading", { name: "방과후학교 운영" })).toBeVisible();

  // 배정: 총액 초과는 막힌다
  await page.locator("select").filter({ hasText: "부서 고르기" }).selectOption({ label: "정보교육부" });
  await page.locator("div.border-dashed input[inputmode=numeric]").fill("12000000");
  await page.getByRole("button", { name: "배정 추가" }).click();
  await expect(page.getByText(/사업 총액.*넘어요/)).toBeVisible();
  await page.locator("div.border-dashed input[inputmode=numeric]").fill("6000000");
  await page.getByRole("button", { name: "배정 추가" }).click();
  await expect(page.getByRole("heading", { name: "정보교육부" })).toBeVisible();

  await page.getByPlaceholder("항목 이름").fill("강사수당");
  await page.getByPlaceholder("한도").fill("5000000");
  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(page.getByRole("cell", { name: "강사수당" })).toBeVisible();

  await page.getByRole("button", { name: "운영 시작" }).click();
  await page.getByRole("button", { name: "운영 시작" }).last().click();
  await expect(page.getByText("운영 중: 금액은 잠겨 있어요")).toBeVisible();
  await page.screenshot({ path: `${shot}-project.png`, fullPage: true });

  // 집행: 한도를 넘기면 사유를 물어본다
  await page.goto(`${base}#/executions`);
  await page.locator("form select").first().selectOption({ index: 1 });
  await page.locator("form input[inputmode=numeric]").fill("5200000");
  await page.locator("form input").nth(2).fill("4월 강사수당");
  await page.getByRole("button", { name: "넣기" }).click();
  await expect(page.getByText(/한도.*넘어요/)).toBeVisible();
  await page.getByPlaceholder(/강사 추가 배정/).fill("강사 1명 추가, 교장 결재");
  await page.getByRole("button", { name: "넣기" }).click();
  await expect(page.getByText("5,200,000원 집행을 넣었어요.")).toBeVisible();
  await expect(page.getByText("한도 초과 사유: 강사 1명 추가, 교장 결재")).toBeVisible();

  await page.goto(`${base}#/`);
  await expect(page.getByText("52.0%").first()).toBeVisible(); // 5,200,000 / 10,000,000
  await page.screenshot({ path: `${shot}-dashboard.png`, fullPage: true });

  // 새로고침해도 남는다
  await page.reload();
  await expect(page.getByText("52.0%").first()).toBeVisible();

  // 엑셀·백업 내려받기
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "엑셀로 내보내기" }).click()]);
  if (!xlsx.suggestedFilename().endsWith(".xlsx")) throw new Error("엑셀 파일 이름이 이상해요");
  await page.goto(`${base}#/settings`);
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "백업 내려받기" }).click()]);
  if (!zip.suggestedFilename().endsWith(".yesan.zip")) throw new Error("백업 파일 이름이 이상해요");
  await expect(page.getByText("마지막 백업 오늘")).toBeVisible();
}

// 에듀파인 업로드: 미리보기 검산 → 반영 → 같은 파일 다시 올리면 전부 '이미 있음'
export async function uploadScenario(page, base, shot) {
  await page.goto(`${base}#/upload`);
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles("tests/fixtures/edufine-cp949.csv");
  await expect(page.getByText("글자 인코딩: CP949")).toBeVisible();
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText(/읽은 행 6 = 신규 1 \+ 이미 있음 0 \+ 짝 없음 4 \+ 제외 1 ✓/)).toBeVisible();
  await page.screenshot({ path: `${shot}-upload-preview.png`, fullPage: true });
  await page.getByRole("button", { name: "5건 반영하기" }).click();
  await page.getByRole("button", { name: "반영", exact: true }).click();
  await expect(page.getByText(/5건을 반영했어요/)).toBeVisible();

  await input.setInputFiles("tests/fixtures/edufine-cp949.csv");
  await expect(page.getByText(/같은 파일을 .*올린 적이 있어요/)).toBeVisible();
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByRole("button", { name: "이미 있음 5" })).toBeVisible();
  await expect(page.getByRole("button", { name: "0건 반영하기" })).toBeDisabled();

  await page.goto(`${base}#/executions`);
  await expect(page.getByText("항목에 연결하지 않은 집행이 4건 있어요")).toBeVisible();
}

// 규정 검색(HWPX·PDF, pdf.js 워커가 실제로 뜨는지)과 증빙 첨부·보완 필요
export async function evidenceScenario(page, base, shot) {
  await page.goto(`${base}#/projects`);
  await page.getByRole("link", { name: "방과후학교 운영" }).click();
  await page.locator('label:has-text("규정 문서 첨부") input[type=file]').setInputFiles(["tests/fixtures/regulation.hwpx", "tests/fixtures/regulation.pdf"]);
  await expect(page.getByRole("button", { name: "regulation.pdf" })).toBeVisible();
  await page.getByPlaceholder("규정에서 찾기").fill("강사 수당");
  await page.getByRole("button", { name: "찾기" }).click();
  await expect(page.locator("mark", { hasText: "강사수당" }).first()).toBeVisible();
  await page.getByPlaceholder("규정에서 찾기").fill("instructor fee");
  await page.getByRole("button", { name: "찾기" }).click();
  await expect(page.locator("mark", { hasText: "Instructor fee" })).toBeVisible();

  await page.goto(`${base}#/evidence`);
  await page.getByRole("button", { name: "전체" }).click();
  await page.getByRole("cell", { name: "4월 강사수당" }).click();
  await page.getByLabel("증빙 유형").selectOption("resolution");
  await page.locator('label:has-text("파일 붙이기") input[type=file]').setInputFiles("tests/fixtures/regulation.pdf");
  await expect(page.getByText("1개를 지출결의서로 붙였어요.")).toBeVisible();
  await page.locator("table").first().getByRole("button", { name: "보완 필요" }).click();
  await page.getByPlaceholder("보완할 내용").fill("교장 결재 도장 누락");
  await page.getByRole("button", { name: "보완 필요로" }).click();
  await expect(page.getByText("교장 결재 도장 누락")).toBeVisible();
  await page.locator("section").getByRole("button", { name: "보완 필요", exact: true }).click(); // 필터 탭
  await expect(page.getByRole("cell", { name: "4월 강사수당" })).toBeVisible();
  await page.screenshot({ path: `${shot}-evidence.png`, fullPage: true });
}

// 대시보드 경고: 근거까지 보이는지
export async function dashboardScenario(page, base, shot) {
  await page.goto(`${base}#/`);
  await expect(page.getByText(/강사수당 한도 초과 1,400,000원/)).toBeVisible();
  await expect(page.getByText(/한도 5,000,000원 · 집행 6,400,000원/)).toBeVisible();
  await expect(page.getByText(/미분류 집행/)).toBeVisible();
  await page.screenshot({ path: `${shot}-dashboard-widgets.png`, fullPage: true });
}

// 추경: 작성 → 검증(감액으로 잔액 음수 막힘) → 제출 → 확정(승인 기록) → 금액 반영 → 확정 직전 숫자
export async function revisionScenario(page, base, shot) {
  await page.goto(`${base}#/revisions`);
  await page.locator("select").filter({ hasText: "사업 고르기" }).selectOption({ label: "방과후학교 운영" });
  await page.getByLabel("추경(총액 증감)").check();
  await page.getByRole("button", { name: "변경안 만들기" }).click();
  await page.getByPlaceholder(/2차 추경/).fill("교육청 증액 교부(가상 공문 123호)");
  // 강사수당은 이미 6,400,000원을 썼다 — 한도를 6,000,000으로 두면 막혀야 한다
  await page.getByLabel("사업 총액 변경 후").fill("12000000");
  await page.getByLabel("정보교육부 변경 후").fill("8000000");
  await page.getByLabel("강사수당 변경 후").fill("6000000");
  await expect(page.getByText(/이미 6,400,000원을 썼어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "제출" })).toBeDisabled();
  await page.getByLabel("강사수당 변경 후").fill("7000000");
  await expect(page.getByText("검증 통과: 3곳이 바뀌어요.")).toBeVisible();
  await page.getByRole("button", { name: "제출" }).click();
  await expect(page.getByText("제출했어요.")).toBeVisible();
  await page.getByRole("button", { name: "확정" }).click();
  await page.getByPlaceholder("예: 학교장").fill("학교장");
  await page.getByRole("button", { name: "확정" }).last().click();
  await expect(page.getByRole("heading", { name: /1차 추경/ })).toBeVisible();
  await page.getByRole("button", { name: "확정 직전 숫자 보기" }).click();
  await expect(page.getByRole("columnheader", { name: "확정 직전" })).toBeVisible();
  await page.screenshot({ path: `${shot}-revision.png`, fullPage: true });

  await page.goto(`${base}#/`);
  await expect(page.getByText("12,000,000원").first()).toBeVisible();
  // 강사수당 한도 7,000,000 > 집행 6,400,000 → 한도 초과 경고가 사라지고 90% 경고로
  await expect(page.getByText(/강사수당 한도 90% 이상 사용/)).toBeVisible();
}

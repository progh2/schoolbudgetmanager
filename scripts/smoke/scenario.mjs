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

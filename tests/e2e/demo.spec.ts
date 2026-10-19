import { test, expect } from "@playwright/test";
test("8개 페이지와 반응형 레이아웃", async ({ page }) => {
  for (const route of [
    "/",
    "/login",
    "/dashboard",
    "/sermons/new",
    "/sermons/demo",
    "/sermons/demo/review",
    "/present/demo",
    "/s/demo",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test("원고 등록, 수정 및 비공개 자료 분리", async ({ page }) => {
  await page.goto("/sermons/new");
  await page.getByLabel("설교 제목").fill("직접 작성 테스트");
  await page
    .getByLabel("원고 또는 테스트 요약")
    .fill("공개 샘플에 노출되면 안 되는 고유 원고");
  await page.getByRole("button", { name: "데모 원고 저장" }).click();
  await page.getByRole("link", { name: "등록한 원고 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "직접 작성 테스트", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("입력한 원고")).toHaveValue(
    "공개 샘플에 노출되면 안 되는 고유 원고",
  );
  await page.goto("/s/demo");
  await expect(
    page.getByText("공개 샘플에 노출되면 안 되는 고유 원고"),
  ).toHaveCount(0);
  expect((await page.goto("/s/local"))?.status()).toBe(404);
  expect((await page.goto("/sermons/unknown"))?.status()).toBe(404);
});
test("검수와 수정 후 재검수", async ({ page }) => {
  await page.goto("/sermons/demo/review");
  const approve = page.getByRole("button", { name: "데모 검수 완료로 표시" });
  await expect(approve).toBeDisabled();
  await page.getByRole("checkbox").check();
  await approve.click();
  await expect(
    page.getByText("데모 검수가 완료되었습니다.", { exact: false }),
  ).toBeVisible();
  await page.locator("#translation-0-en").fill("Edited sample");
  await expect(
    page.getByText("텍스트를 수정하면 데모 검수 상태가 초기화됩니다."),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#translation-0-en")).toHaveValue("Edited sample");
});
test("언어, 글자 크기 및 장면 이동", async ({ page }) => {
  await page.goto("/s/demo");
  await page.getByLabel("언어 / Language").selectOption("vi");
  await expect(page.locator(".caption")).toContainText("Đê-bô-ra");
  await page.getByRole("button", { name: "글자 크게" }).click();
  await expect(page.locator(".viewer > div")).toHaveCSS("font-size", "22px");
  await page.getByRole("button", { name: "Tiếp", exact: true }).click();
  await expect(page.locator(".caption")).toContainText("Si-sê-ra");
  await page.getByRole("button", { name: "Trước", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Trước", exact: true }),
  ).toBeDisabled();
});
test("TXT 불러오기 및 잘못된 파일 거부", async ({ page }) => {
  await page.goto("/sermons/new");
  await page.getByLabel("TXT 파일 가져오기").setInputFiles({
    name: "sample.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("테스트 요약 파일"),
  });
  await expect(page.getByLabel("원고 또는 테스트 요약")).toHaveValue(
    "테스트 요약 파일",
  );
  await page.getByLabel("TXT 파일 가져오기").setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("status")).toContainText("TXT 파일을 선택");
});
test("손상된 저장 자료로도 화면이 열린다", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem("sermonbridge-phase1-v1", '{"demo":null}'),
  );
  await page.goto("/s/demo");
  await expect(page.locator(".caption")).toContainText("드보라");
});

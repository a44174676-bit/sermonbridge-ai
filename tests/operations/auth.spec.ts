import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const SB = "20000000-0000-4000-8000-000000000002";
async function login(page: Page, name = "admin_a") {
  await page.goto("/login");
  await page
    .getByLabel("이메일", { exact: true })
    .fill(`${name}@sermonbridge.example.test`);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("비로그인 관리 화면 차단 및 공개 원고 URL 차단", async ({ page }) => {
  for (const route of [
    "/dashboard",
    "/sermons/new",
    "/sermons/20000000-0000-4000-8000-000000000001",
    "/members",
    "/present/20000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect(
    (await page.goto("/s/20000000-0000-4000-8000-000000000001"))?.status(),
  ).toBe(404);
});
test("로그인, 세션 유지, 영구 저장, 로그아웃 및 재로그인", async ({
  page,
  context,
}) => {
  await login(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "설교 관리" })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name.includes("auth-token") && c.httpOnly)).toBe(
    true,
  );
  await page.goto("/sermons/new");
  const title = `합성 저장 검증 ${Date.now()}`;
  await page.getByLabel("설교 제목").fill(title);
  await page.getByLabel("성경 본문", { exact: true }).fill("테스트 본문");
  await page
    .getByLabel("설교 원고", { exact: true })
    .fill("실제 설교가 아닌 영구 저장 확인용 합성 텍스트입니다.");
  await page.getByRole("button", { name: "원고 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/sermons\/[0-9a-f-]{36}$/);
  const path = new URL(page.url()).pathname;
  await expect(page.getByLabel("설교 원고", { exact: true })).toHaveValue(
    "실제 설교가 아닌 영구 저장 확인용 합성 텍스트입니다.",
  );
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await login(page);
  await page.goto(path);
  await expect(page.getByLabel("설교 제목")).toHaveValue(title);
});
test("다른 교회의 원고 접근과 media 승인 차단", async ({ page }) => {
  await login(page, "media_a");
  expect((await page.goto(`/sermons/${SB}`))?.status()).toBe(404);
  await page.goto("/sermons/20000000-0000-4000-8000-000000000001/review");
  await expect(
    page.getByText(
      "자료 담당자는 원고를 수정할 수 있지만 최종 승인할 수 없습니다.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "검수 결정 저장" }),
  ).toHaveCount(0);
  await page.goto("/members");
  await expect(
    page.getByText("교회 관리자만 구성원 권한을 관리할 수 있습니다."),
  ).toBeVisible();
});
test("데모 경로는 인증된 운영 세션에서도 샘플만 사용한다", async ({ page }) => {
  await login(page);
  await page.goto("/demo/dashboard");
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(page.getByText("합성 테스트 원고", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("link", { name: "설교 등록 체험", exact: false })
    .click();
  await expect(page).toHaveURL(/\/demo\/sermons\/new$/);
  await page.getByLabel("설교 제목").fill("데모 전용 원고");
  await page
    .getByLabel("원고 또는 테스트 요약")
    .fill("데모 데이터는 운영 DB에 저장하지 않습니다.");
  await page.getByRole("button", { name: "데모 원고 저장" }).click();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "데모 전용 원고", exact: true }),
  ).toHaveCount(0);
});
test("실제 Auth와 PostgREST가 조작된 권한·교회 접근을 차단한다", async () => {
  const c = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const anonymous = await c.from("sermons").select("source");
  expect(anonymous.error).toBeTruthy();
  const { error } = await c.auth.signInWithPassword({
    email: "media_a@sermonbridge.example.test",
    password: process.env.TEST_USER_PASSWORD!,
  });
  expect(error).toBeNull();
  const other = await c.from("sermons").select("source").eq("id", SB);
  expect(other.error).toBeNull();
  expect(other.data).toEqual([]);
  const approval = await c.rpc("review_sermon", {
    target: "20000000-0000-4000-8000-000000000001",
    expected_revision: 1,
    decision: "approved",
    note: "",
  });
  expect(approval.error?.code).toBe("42501");
  await c.auth.signOut();
});
test("관리자 승인과 수정 후 재검수", async ({ page }) => {
  await login(page, "pastor_a");
  await page.goto("/sermons/new");
  await page.getByLabel("설교 제목").fill(`검수용 합성 ${Date.now()}`);
  await page
    .getByLabel("설교 원고", { exact: true })
    .fill("목회자 검수 테스트용 합성 원고");
  await page.getByRole("button", { name: "원고 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/sermons\/[0-9a-f-]{36}$/);
  const path = new URL(page.url()).pathname;
  await page.goto(path + "/review");
  await page.getByRole("button", { name: "검수 결정 저장" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "검수 상태를 저장했습니다." }),
  ).toContainText("검수 상태를 저장했습니다.");
  await page.reload();
  await expect(page.locator(".eyebrow")).toContainText("내부 승인 완료");
  await page.getByLabel("설교 원고", { exact: true }).fill("수정된 합성 원고");
  await page.getByRole("button", { name: "원고 저장", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await expect(page.locator(".eyebrow")).toContainText("검수 대기");
});

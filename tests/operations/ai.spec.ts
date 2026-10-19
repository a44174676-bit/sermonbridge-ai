import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { mockAnalysis, mockTranslation, syntheticSource } from "../fixtures/ai";
import { languages } from "../../src/lib/ai/schema";
let id: string;
test.beforeAll(async () => {
  if (process.env.SERMONBRIDGE_LOCAL_TEST !== "true")
    throw new Error("합성 테스트만 허용합니다.");
  id = randomUUID();
  const db = new Client({ connectionString: process.env.TEST_DB_URL });
  await db.connect();
  const church = "10000000-0000-4000-8000-000000000001";
  try {
    await db.query(
      "insert into public.sermons(id,church_id,created_by,title,source,scripture) values($1,$2,$3,$4,$5,$6)",
      [
        id,
        church,
        process.env.TEST_ADMIN_A_ID,
        syntheticSource.title,
        syntheticSource.source,
        syntheticSource.scripture,
      ],
    );
    await db.query(
      "insert into public.sermon_analyses(sermon_id,church_id,source_version,data) values($1,$2,1,$3)",
      [id, church, JSON.stringify(mockAnalysis())],
    );
    for (const language of languages) {
      const t = mockTranslation(language);
      await db.query(
        "insert into public.sermon_translations(sermon_id,church_id,language,source_version,analysis_version,full_text,paragraphs,scenes) values($1,$2,$3,1,1,$4,$5,$6)",
        [
          id,
          church,
          language,
          t.paragraphs.map((p) => p.text).join("\n\n"),
          JSON.stringify(t.paragraphs),
          JSON.stringify(t.scenes),
        ],
      );
    }
  } finally {
    await db.end();
  }
});
async function login(page: Page, user = "admin_a") {
  await page.goto("/login");
  await page
    .getByLabel("이메일", { exact: true })
    .fill(`${user}@sermonbridge.example.test`);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("모의 결과의 5개 언어 비교 및 실제 키 미설정 안내", async ({ page }) => {
  await login(page);
  await page.goto(`/sermons/${id}`);
  await expect(
    page.getByRole("button", { name: "비용 확인 후 생성" }),
  ).toBeDisabled();
  for (const lang of languages) {
    await page.getByLabel("비교할 언어").selectOption(lang);
    await expect(page.locator(`#${lang}-paragraph-1`)).toBeVisible();
  }
  await expect(
    page.getByText("실제 호출은 실행하지 않습니다.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("번역 텍스트 수정 저장 후 다시 읽기", async ({ page }) => {
  await login(page);
  await page.goto(`/sermons/${id}`);
  await page.getByLabel("비교할 언어").selectOption("en");
  const field = page.locator("#en-paragraph-1");
  const original = await field.inputValue();
  await field.fill(original + " (검수 완료)");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: "번역 수정 저장" }).click(),
  ]);
  await expect(page.locator("#en-paragraph-1")).toHaveValue(
    original + " (검수 완료)",
  );
  await page.reload();
  await page.getByLabel("비교할 언어").selectOption("en");
  await expect(page.locator("#en-paragraph-1")).toHaveValue(
    original + " (검수 완료)",
  );
  await expect(page.getByLabel("설교 원고", { exact: true })).toHaveValue(
    syntheticSource.source,
  );
});
test("media 검수 요청과 목회자의 최종 승인", async ({ page }) => {
  await login(page, "media_a");
  await page.goto(`/sermons/${id}/review`);
  await page.getByRole("button", { name: "목회자에게 검수 요청" }).click();
  await expect(
    page.getByText("목회자 검수 요청이 등록되었습니다."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "검수 결정 저장" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await login(page, "pastor_a");
  await page.goto(`/sermons/${id}/review`);
  await page.getByRole("button", { name: "검수 결정 저장" }).click();
  await expect(page.locator(".eyebrow")).toContainText("내부 승인 완료");
});
test("장면 내용 수정은 승인을 해제하고 기존 번역을 이전 버전으로 표시", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/sermons/${id}`);
  const field = page.locator("#scene-0-summary");
  await field.fill((await field.inputValue()) + " 담당자 검토 내용.");
  await page.getByRole("button", { name: "장면·분석 수정 저장" }).click();
  await expect(page.locator(".eyebrow")).toContainText("검수 대기");
  await expect(
    page.getByText("이 번역은 이전 원고 또는 분석의 결과입니다.", {
      exact: false,
    }),
  ).toBeVisible();
});

import { defineConfig, devices } from "@playwright/test";
process.loadEnvFile(".env.local");
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
)
  throw new Error("Use synthetic local services only");
export default defineConfig({
  testDir: "./tests/operations",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "operations-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "operations-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    env: { APP_MODE: "auto" },
    timeout: 120000,
  },
});

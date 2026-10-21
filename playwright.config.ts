import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "3001",
      APP_ORIGIN: "http://127.0.0.1:3001",
      DATABASE_URL:
        process.env.BROWSER_DATABASE_URL ??
        "postgres://postgres@127.0.0.1:55432/kyle_browser",
      APP_PASSWORD: "browser-test-password-only",
      CALENDAR_ENCRYPTION_KEY: "1".repeat(64),
    },
  },
});

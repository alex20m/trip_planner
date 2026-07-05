import { defineConfig, devices } from "@playwright/test";

const E2E_USER = process.env.E2E_USER;
const E2E_TEST_LOGIN_SECRET = process.env.E2E_TEST_LOGIN_SECRET;
if (!E2E_USER || !E2E_TEST_LOGIN_SECRET) {
  throw new Error("E2E_USER and E2E_TEST_LOGIN_SECRET must be set (via env or .env.local)");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json"
      },
      dependencies: ["setup"],
      testIgnore: /global-setup\.ts/
    }
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});

export { E2E_USER, E2E_TEST_LOGIN_SECRET };

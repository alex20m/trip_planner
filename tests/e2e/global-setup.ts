import { test as setup, expect } from "@playwright/test";
import path from "path";

const E2E_USER = process.env.E2E_USER!;
const E2E_TEST_LOGIN_SECRET = process.env.E2E_TEST_LOGIN_SECRET!;

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  // Bypasses the real magic-link email — see src/app/api/test/login/route.ts.
  const response = await page.request.post("/api/test/login", {
    headers: { "x-e2e-secret": E2E_TEST_LOGIN_SECRET },
    data: { email: E2E_USER }
  });
  if (!response.ok()) {
    throw new Error(`POST /api/test/login -> ${response.status()}: ${await response.text()}`);
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});

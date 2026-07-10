import { test, expect } from "@playwright/test";

// Run without the authenticated storage state from the "setup" project.
test.use({ storageState: { cookies: [], origins: [] } });

test("redirects unauthenticated users to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "PlanPal" })).toBeVisible();
});

test("shows the code-based sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("you@email.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /email me a code/i })).toBeVisible();
});

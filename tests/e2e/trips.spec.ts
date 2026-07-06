import { test, expect, type Page } from "@playwright/test";

async function createTrip(page: Page, name: string) {
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByPlaceholder(/trip name/i).fill(name);
  await page.getByRole("button", { name: "Create trip" }).click();
}

test("create a trip, add an event, and read it back via the calendar feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  const tripName = `E2E Trip ${Date.now()}`;
  await createTrip(page, tripName);

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: tripName })).toBeVisible();

  // Add an event
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByPlaceholder("Title").fill("Flight to Rome");
  await page.getByLabel("Start").fill("2026-08-01T10:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "New event" })).not.toBeVisible();

  // Subscribe via the calendar sync link and confirm the event round-trips through the .ics feed
  await page.getByRole("button", { name: "More trip options" }).click();
  await page.getByRole("menuitem", { name: "Sync calendar" }).click();
  const calendarUrl = await page.locator("input[readonly]").inputValue();
  expect(calendarUrl).toContain("/api/calendar/");

  const feed = await page.request.get(calendarUrl);
  expect(feed.ok()).toBeTruthy();
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const body = await feed.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("Flight to Rome");
});

test("a newly created trip appears back in the trip list", async ({ page }) => {
  await page.goto("/");
  const tripName = `List Trip ${Date.now()}`;
  await createTrip(page, tripName);
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(tripName) })).toBeVisible();
});

test("a trip can be deleted by its owner and disappears from the trip list", async ({ page }) => {
  await page.goto("/");
  const tripName = `Deletable Trip ${Date.now()}`;
  await createTrip(page, tripName);
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "More trip options" }).click();
  await page.getByRole("menuitem", { name: "Delete trip" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: new RegExp(tripName) })).not.toBeVisible();
});

test("a trip is created with the given date range, and the dates can be edited afterwards", async ({ page }) => {
  await page.goto("/");
  const tripName = `Dated Trip ${Date.now()}`;
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByPlaceholder(/trip name/i).fill(tripName);
  await page.getByLabel("Start").fill("2026-09-01");
  await page.getByLabel("End").fill("2026-09-03");
  await page.getByRole("button", { name: "Create trip" }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  const dateButton = page.getByRole("button", { name: /1 Sep.*3 Sep 2026/ });
  await expect(dateButton).toBeVisible();

  // Editing the trip's dates updates the label shown in the planner.
  await dateButton.click();
  await page.getByLabel("Start").fill("2026-09-02");
  await page.getByLabel("End").fill("2026-09-05");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: /2 Sep.*5 Sep 2026/ })).toBeVisible();
});

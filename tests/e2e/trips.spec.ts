import { test, expect, type Page } from "@playwright/test";

async function createTrip(page: Page, name: string, dates?: { start: string; end: string }) {
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByPlaceholder(/trip name/i).fill(name);
  // Events must fall within the trip's range, so tests that add a dated event
  // pin the trip to a window that covers it instead of the default "today".
  if (dates) {
    await page.getByLabel("Start").fill(dates.start);
    await page.getByLabel("End").fill(dates.end);
  }
  await page.getByRole("button", { name: "Create trip" }).click();
}

test("create a trip, add an event, and read it back via the calendar feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  const tripName = `E2E Trip ${Date.now()}`;
  await createTrip(page, tripName, { start: "2026-08-01", end: "2026-08-07" });

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: tripName })).toBeVisible();

  // Add an event. Exact match: the calendar days now expose their own
  // "Add event on <day>" buttons, which the substring default would also hit.
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByPlaceholder("Title").fill("Flight to Rome");
  await page.getByPlaceholder("Start").fill("2026-08-01T10:00");
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

test("pressing a calendar day opens the event composer prefilled with that day", async ({ page }) => {
  await page.goto("/");
  const tripName = `DayPress Trip ${Date.now()}`;
  await createTrip(page, tripName);
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);

  // getByRole only sees the accessibility tree, so at the desktop viewport
  // this matches the week-grid day headers (the agenda copies are hidden).
  await page.getByRole("button", { name: /^Add event on/ }).first().click();
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  // A day press without a specific hour opens the composer at midday.
  await expect(page.getByPlaceholder("Start")).toHaveValue(/T12:00$/);
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

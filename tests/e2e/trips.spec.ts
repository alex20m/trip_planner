import { test, expect } from "@playwright/test";

test("create a trip, add an event, and read it back via the calendar feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  const tripName = `E2E Trip ${Date.now()}`;
  await page.getByPlaceholder(/new trip/i).fill(tripName);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: tripName })).toBeVisible();

  // Add an event
  await page.getByRole("button", { name: "+ Event" }).click();
  await page.getByPlaceholder("Title").fill("Flight to Rome");
  await page.getByLabel("Start").fill("2026-08-01T10:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "New event" })).not.toBeVisible();

  // Subscribe via the calendar sync link and confirm the event round-trips through the .ics feed
  await page.getByRole("button", { name: "Sync" }).click();
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
  await page.getByPlaceholder(/new trip/i).fill(tripName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: tripName })).toBeVisible();
});

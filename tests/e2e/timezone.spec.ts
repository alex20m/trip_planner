import { test, expect, type Browser, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// The bug, end to end: plan a trip at home, then open the app after landing
// somewhere else. Nothing about the plan may have moved.
//
// Each "somewhere else" is a fresh browser context with its own timezoneId and
// the same signed-in storage state — the closest thing to actually flying.
// ---------------------------------------------------------------------------

const AUTH_STATE = "tests/e2e/.auth/user.json";

// Home, then two long-haul destinations on either side of the date line, then
// a zone whose offset is not a whole number of hours.
const DESTINATIONS = ["America/New_York", "Pacific/Kiritimati", "Asia/Kathmandu", "Australia/Adelaide"];

async function openAs(browser: Browser, timezoneId: string, url: string): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH_STATE, timezoneId });
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

test("an event keeps the time it was entered with, wherever the app is opened", async ({ browser }) => {
  const home = await openAs(browser, "Europe/Helsinki", "/");

  const tripName = `Timezone Trip ${Date.now()}`;
  await home.getByRole("button", { name: "New trip" }).click();
  await home.getByPlaceholder(/trip name/i).fill(tripName);
  await home.getByLabel("Start").fill("2026-08-01");
  await home.getByLabel("End").fill("2026-08-07");
  await home.getByRole("button", { name: "Create trip" }).click();
  await expect(home).toHaveURL(/\/trips\/[0-9a-f-]+/);
  const tripUrl = home.url();

  // An evening event and an early-morning one: the two that a timezone shift
  // pushes onto a neighbouring day first.
  await home.getByRole("button", { name: "Add event", exact: true }).click();
  await home.getByPlaceholder("Title").fill("Dinner in Rome");
  await home.getByPlaceholder("Start").fill("2026-08-01T19:00");
  await home.getByPlaceholder("End (optional)").fill("2026-08-01T21:30");
  await home.getByRole("button", { name: "Save" }).click();
  await expect(home.getByRole("heading", { name: "New event" })).not.toBeVisible();

  await home.getByRole("button", { name: "Add event", exact: true }).click();
  await home.getByPlaceholder("Title").fill("Sunrise walk");
  await home.getByPlaceholder("Start").fill("2026-08-02T00:15");
  await home.getByRole("button", { name: "Save" }).click();
  await expect(home.getByRole("heading", { name: "New event" })).not.toBeVisible();

  await expect(home.getByText("19:00–21:30").first()).toBeVisible();
  await home.context().close();

  for (const timezoneId of DESTINATIONS) {
    const abroad = await openAs(browser, timezoneId, tripUrl);
    await expect(abroad.getByRole("heading", { name: tripName })).toBeVisible();

    // Same clock readings on the calendar…
    await expect(abroad.getByText("19:00–21:30").first(), `dinner label in ${timezoneId}`).toBeVisible();
    await expect(abroad.getByText("00:15").first(), `walk label in ${timezoneId}`).toBeVisible();

    // …and the same date and time in the event's own detail view.
    await abroad.getByRole("button", { name: /Dinner in Rome/ }).first().click();
    await expect(
      abroad.getByText("Sat 1 Aug 2026, 19:00 – 21:30"),
      `dinner detail in ${timezoneId}`
    ).toBeVisible();
    await abroad.getByRole("button", { name: "Close" }).click();

    await abroad.getByRole("button", { name: /Sunrise walk/ }).first().click();
    await expect(abroad.getByText("Sun 2 Aug 2026, 00:15"), `walk detail in ${timezoneId}`).toBeVisible();

    await abroad.context().close();
  }
});

test("reopening and re-saving an event abroad does not shift its time", async ({ browser }) => {
  const home = await openAs(browser, "Europe/Helsinki", "/");

  const tripName = `Resave Trip ${Date.now()}`;
  await home.getByRole("button", { name: "New trip" }).click();
  await home.getByPlaceholder(/trip name/i).fill(tripName);
  await home.getByLabel("Start").fill("2026-08-01");
  await home.getByLabel("End").fill("2026-08-07");
  await home.getByRole("button", { name: "Create trip" }).click();
  await expect(home).toHaveURL(/\/trips\/[0-9a-f-]+/);
  const tripUrl = home.url();

  await home.getByRole("button", { name: "Add event", exact: true }).click();
  await home.getByPlaceholder("Title").fill("Museum visit");
  await home.getByPlaceholder("Start").fill("2026-08-03T09:30");
  await home.getByRole("button", { name: "Save" }).click();
  await expect(home.getByRole("heading", { name: "New event" })).not.toBeVisible();
  await home.context().close();

  // Land, edit the title, save. The time must survive the round trip.
  const abroad = await openAs(browser, "Pacific/Kiritimati", tripUrl);
  await abroad.getByRole("button", { name: /Museum visit/ }).first().click();
  await abroad.getByRole("button", { name: "Edit" }).click();
  await expect(abroad.getByPlaceholder("Start")).toHaveValue("2026-08-03T09:30");
  await abroad.getByPlaceholder("Title").fill("Museum visit (booked)");
  await abroad.getByRole("button", { name: "Save" }).click();
  await expect(abroad.getByRole("heading", { name: "Edit event" })).not.toBeVisible();
  await expect(abroad.getByText("09:30").first()).toBeVisible();
  await abroad.context().close();

  // And it still reads the same back home.
  const backHome = await openAs(browser, "Europe/Helsinki", tripUrl);
  await backHome.getByRole("button", { name: /Museum visit \(booked\)/ }).first().click();
  await expect(backHome.getByText("Mon 3 Aug 2026, 09:30")).toBeVisible();
  await backHome.context().close();
});

test("the calendar feed exports floating times that no client can re-convert", async ({ browser }) => {
  const home = await openAs(browser, "Europe/Helsinki", "/");

  const tripName = `Feed Trip ${Date.now()}`;
  await home.getByRole("button", { name: "New trip" }).click();
  await home.getByPlaceholder(/trip name/i).fill(tripName);
  await home.getByLabel("Start").fill("2026-08-01");
  await home.getByLabel("End").fill("2026-08-07");
  await home.getByRole("button", { name: "Create trip" }).click();
  await expect(home).toHaveURL(/\/trips\/[0-9a-f-]+/);

  await home.getByRole("button", { name: "Add event", exact: true }).click();
  await home.getByPlaceholder("Title").fill("Dinner in Rome");
  await home.getByPlaceholder("Start").fill("2026-08-01T19:00");
  await home.getByPlaceholder("End (optional)").fill("2026-08-01T21:30");
  await home.getByRole("button", { name: "Save" }).click();
  await expect(home.getByRole("heading", { name: "New event" })).not.toBeVisible();

  await home.getByRole("button", { name: "More trip options" }).click();
  await home.getByRole("menuitem", { name: "Sync calendar" }).click();
  const calendarUrl = await home.locator("input[readonly]").inputValue();

  const body = await (await home.request.get(calendarUrl)).text();
  // No trailing Z and no TZID: RFC 5545 floating time, shown as-is by every
  // calendar client regardless of the zone it is being viewed in.
  expect(body).toContain("DTSTART:20260801T190000\r\n");
  expect(body).toContain("DTEND:20260801T213000\r\n");
  expect(body).not.toMatch(/^DTSTART:\d{8}T\d{6}Z/m);
  expect(body).not.toMatch(/^DTEND:\d{8}T\d{6}Z/m);

  await home.context().close();
});

import { test, expect, type Browser, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// The bug, end to end: plan a trip at home, then open the app after landing
// somewhere else. Nothing about the plan may have moved.
//
// Each "somewhere else" is a fresh browser context with its own timezoneId and
// the same signed-in storage state — the closest thing to actually flying.
// ---------------------------------------------------------------------------

const AUTH_STATE = "tests/e2e/.auth/user.json";

// Behind UTC, the furthest-ahead zone on earth, and one whose offset is not a
// whole number of hours. (The unit suites run a wider matrix; each context
// here costs a browser launch, so this stays to the three sharpest cases.)
const DESTINATIONS = ["America/New_York", "Pacific/Kiritimati", "Asia/Kathmandu"];

// The calendar renders every event twice — an agenda card for narrow screens
// and a time-grid block from tablet width up — and hides one with CSS. Plain
// text matching resolves to the hidden copy first, so filter to what is
// actually on screen.
const visibleText = (page: Page, text: string) => page.locator(`span:text-is("${text}"):visible`);

async function openAs(browser: Browser, timezoneId: string, url: string): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH_STATE, timezoneId });
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

// The planner opens on the week containing the trip's start date, so events
// have to sit in that week to be on screen without paging.
async function createTrip(page: Page, name: string): Promise<string> {
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByPlaceholder(/trip name/i).fill(name);
  await page.getByLabel("Start").fill("2026-08-01");
  await page.getByLabel("End").fill("2026-08-07");
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  return page.url();
}

async function addEvent(page: Page, title: string, start: string, end?: string) {
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByPlaceholder("Title").fill(title);
  await page.getByPlaceholder("Start").fill(start);
  if (end) await page.getByPlaceholder("End (optional)").fill(end);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "New event" })).not.toBeVisible();
}

test("an event keeps the time it was entered with, wherever the app is opened", async ({ browser }) => {
  test.setTimeout(120_000); // one browser context per destination

  const home = await openAs(browser, "Europe/Helsinki", "/");
  const tripName = `Timezone Trip ${Date.now()}`;
  const tripUrl = await createTrip(home, tripName);

  // An evening event and a near-midnight one: the second is what a zone ahead
  // of UTC used to push onto the following day.
  await addEvent(home, "Dinner in Rome", "2026-08-01T19:00", "2026-08-01T21:30");
  await addEvent(home, "Last call", "2026-08-01T23:45");

  await expect(visibleText(home, "19:00–21:30")).toBeVisible();
  await expect(home.getByRole("button", { name: /Last call/ }).first()).toBeVisible();
  await home.context().close();

  for (const timezoneId of DESTINATIONS) {
    const abroad = await openAs(browser, timezoneId, tripUrl);
    await expect(abroad.getByRole("heading", { name: tripName })).toBeVisible();

    // Same clock reading on the calendar…
    await expect(visibleText(abroad, "19:00–21:30"), `dinner label in ${timezoneId}`).toBeVisible();

    // …and the same date and time in each event's own detail view.
    await abroad.getByRole("button", { name: /Dinner in Rome/ }).first().click();
    await expect(
      abroad.getByText("Sat 1 Aug 2026, 19:00 – 21:30"),
      `dinner detail in ${timezoneId}`
    ).toBeVisible();
    await abroad.getByRole("button", { name: "Close" }).click();

    await abroad.getByRole("button", { name: /Last call/ }).first().click();
    await expect(abroad.getByText("Sat 1 Aug 2026, 23:45"), `last-call detail in ${timezoneId}`).toBeVisible();

    await abroad.context().close();
  }
});

test("reopening and re-saving an event abroad does not shift its time", async ({ browser }) => {
  test.setTimeout(90_000);

  const home = await openAs(browser, "Europe/Helsinki", "/");
  const tripUrl = await createTrip(home, `Resave Trip ${Date.now()}`);
  await addEvent(home, "Museum visit", "2026-08-01T09:30");
  await home.context().close();

  // Land, edit the title, save. The time must survive the round trip.
  const abroad = await openAs(browser, "Pacific/Kiritimati", tripUrl);
  await abroad.getByRole("button", { name: /Museum visit/ }).first().click();
  await abroad.getByRole("button", { name: "Edit" }).click();
  await expect(abroad.getByPlaceholder("Start")).toHaveValue("2026-08-01T09:30");
  await abroad.getByPlaceholder("Title").fill("Museum visit (booked)");
  await abroad.getByRole("button", { name: "Save" }).click();
  await expect(abroad.getByRole("heading", { name: "Edit event" })).not.toBeVisible();
  await abroad.getByRole("button", { name: /Museum visit \(booked\)/ }).first().click();
  await expect(abroad.getByText("Sat 1 Aug 2026, 09:30")).toBeVisible();
  await abroad.context().close();

  // And it still reads the same back home.
  const backHome = await openAs(browser, "Europe/Helsinki", tripUrl);
  await backHome.getByRole("button", { name: /Museum visit \(booked\)/ }).first().click();
  await expect(backHome.getByText("Sat 1 Aug 2026, 09:30")).toBeVisible();
  await backHome.context().close();
});

test("the calendar feed exports floating times that no client can re-convert", async ({ browser }) => {
  const home = await openAs(browser, "Europe/Helsinki", "/");
  await createTrip(home, `Feed Trip ${Date.now()}`);
  await addEvent(home, "Dinner in Rome", "2026-08-01T19:00", "2026-08-01T21:30");

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

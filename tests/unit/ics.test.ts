import { describe, it, expect, afterAll } from "vitest";
import { buildICS } from "@/lib/ics";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

function event(overrides: Partial<TripEvent> & { updated_at?: string } = {}): TripEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    trip_id: "trip-1",
    title: "Museum visit",
    type: "activity",
    start_at: "2026-08-01T10:00:00.000Z",
    end_at: "2026-08-01T12:00:00.000Z",
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: false,
    ...overrides
  };
}

describe("buildICS", () => {
  it("wraps events in a valid VCALENDAR envelope", () => {
    const ics = buildICS({ id: "trip-1", name: "Rome 2026" }, [], "example.com");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Rome 2026");
  });

  // Floating (no trailing Z, no TZID) so a subscribed calendar shows the time
  // as entered instead of re-converting it into the viewer's current zone.
  it("renders timed events with floating DTSTART/DTEND", () => {
    const ics = buildICS({ id: "trip-1", name: "Trip" },[event()], "example.com");
    expect(ics).toContain("DTSTART:20260801T100000\r\n");
    expect(ics).toContain("DTEND:20260801T120000\r\n");
    expect(ics).toContain("UID:11111111-1111-1111-1111-111111111111@example.com");
  });

  it("prefixes travel events and leaves activities unprefixed", () => {
    const ics = buildICS({ id: "trip-1", name: "Trip" },[event({ type: "travel", title: "Flight" })], "example.com");
    expect(ics).toContain("SUMMARY:🧳 Flight");
  });

  it("joins a travel leg's start and end destination in LOCATION", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [event({ type: "travel", title: "Flight", location: "Helsinki", end_location: "Oulu" })],
      "example.com"
    );
    expect(ics).toContain("LOCATION:Helsinki → Oulu");
  });

  it("keeps a plain LOCATION for travel events without an end destination", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [event({ type: "travel", title: "Flight", location: "Helsinki" })],
      "example.com"
    );
    expect(ics).toContain("LOCATION:Helsinki\r\n");
  });

  it("renders accommodation as an all-day event ending the day after checkout", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [
        event({
          type: "accommodation",
          title: "Hotel",
          start_at: "2026-08-01T00:00:00.000Z",
          end_at: "2026-08-03T00:00:00.000Z"
        })
      ],
      "example.com"
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260801");
    expect(ics).toContain("DTEND;VALUE=DATE:20260804");
  });

  it("renders an all-day activity as a date-only event, not a timed 00:00 block", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [event({ type: "activity", title: "City tour", all_day: true, start_at: "2026-08-01T00:00:00.000Z", end_at: null })],
      "example.com"
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260801");
    expect(ics).toContain("DTEND;VALUE=DATE:20260802");
    expect(ics).not.toContain("DTSTART:20260801T000000Z");
  });

  it("defaults accommodation DTEND to the day after check-in when there is no checkout", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [event({ type: "accommodation", title: "Hotel", start_at: "2026-08-01T00:00:00.000Z", end_at: null })],
      "example.com"
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260801");
    expect(ics).toContain("DTEND;VALUE=DATE:20260802");
  });

  it("escapes commas, semicolons, backslashes and newlines per RFC 5545", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [event({ title: "Lunch, drinks; more\\stuff", description: "Line one\nLine two" })],
      "example.com"
    );
    expect(ics).toContain("SUMMARY:Lunch\\, drinks\\; more\\\\stuff");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds lines longer than 75 octets with a leading space continuation", () => {
    const longTitle = "A".repeat(120);
    const ics = buildICS({ id: "trip-1", name: "Trip" },[event({ title: longTitle })], "example.com");
    const lines = ics.split("\r\n");
    const summaryLineIndex = lines.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(summaryLineIndex).toBeGreaterThan(-1);
    expect(lines[summaryLineIndex + 1].startsWith(" ")).toBe(true);
  });

  it("never splits a multi-byte character across a fold boundary", () => {
    // An accented, emoji-laden title long enough to fold, engineered so a
    // naive UTF-16 fold at char 74 would cut through the middle of a
    // multi-byte character. The output must stay valid UTF-8 (no replacement
    // characters) or Apple Calendar silently drops the event.
    const title = "Kaffe i København ☕️ med Zürich-vänner 🏔️ " + "å".repeat(40) + " 🎉";
    const ics = buildICS({ id: "trip-1", name: "Trip" }, [event({ title })], "example.com");
    expect(ics).not.toContain("�"); // no lone-surrogate corruption
    // A round-trip through UTF-8 must be lossless (lone surrogates would not be).
    expect(Buffer.from(ics, "utf8").toString("utf8")).toBe(ics);
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // Unfolding (drop CRLF + one leading continuation space) restores the title.
    const unfolded = ics.split("\r\n").reduce((acc, l) => (l.startsWith(" ") ? acc + l.slice(1) : acc + "\n" + l), "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
  });

  it("includes SEQUENCE 0 and omits LAST-MODIFIED when there is no updated_at", () => {
    const ics = buildICS({ id: "trip-1", name: "Trip" },[event()], "example.com");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).not.toContain("LAST-MODIFIED");
  });

  it("adds a single transparent all-day marker event spanning the whole trip", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Rome 2026", start_date: "2026-08-01", end_date: "2026-08-03" },
      [],
      "example.com"
    );
    const dayEvents = ics.split("BEGIN:VEVENT").length - 1;
    expect(dayEvents).toBe(1);
    expect(ics).toContain("UID:trip-span-trip-1@example.com");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260801");
    // All-day DTEND is exclusive: the marker ends the day after the last trip day.
    expect(ics).toContain("DTEND;VALUE=DATE:20260804");
    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("SUMMARY:🌍 Rome 2026");
  });

  it("emits no trip marker when the trip has no date range", () => {
    const ics = buildICS({ id: "trip-1", name: "Trip" }, [], "example.com");
    expect(ics).not.toContain("trip-span-");
    expect(ics).not.toContain("TRANSP:TRANSPARENT");
  });

  it("derives SEQUENCE from updated_at and adds LAST-MODIFIED when present", () => {
    const ics = buildICS(
      { id: "trip-1", name: "Trip" },
      [{ ...event(), updated_at: "2026-08-01T00:00:00.000Z" } as TripEvent],
      "example.com"
    );
    expect(ics).toContain("SEQUENCE:1785542400");
    expect(ics).toContain("LAST-MODIFIED:20260801T000000Z");
  });
});

// ---------------------------------------------------------------------------
// A subscribed calendar must not re-time the trip when the phone changes zone.
// ---------------------------------------------------------------------------
describe("the feed is timezone-independent", () => {
  afterAll(restoreTimeZone);

  const trip = { id: "trip-1", name: "Rome 2026", start_date: "2026-08-03", end_date: "2026-08-09" };
  const events = [
    event({ id: "a", title: "Sunrise walk", start_at: "2026-08-05T00:15:00Z", end_at: "2026-08-05T01:45:00Z" }),
    event({ id: "b", title: "Last call", start_at: "2026-08-05T23:45:00Z", end_at: "2026-08-06T00:30:00Z" }),
    event({
      id: "c",
      title: "Hotel Roma",
      type: "accommodation",
      start_at: "2026-08-03T00:00:00Z",
      end_at: "2026-08-08T00:00:00Z"
    })
  ];

  // DTSTAMP is a real instant ("when this feed was generated") and legitimately
  // ticks between calls, so it is normalised away before comparing feeds.
  const stable = (ics: string) => ics.replace(/DTSTAMP:\d{8}T\d{6}Z/g, "DTSTAMP:<now>");

  it("emits an identical feed from every timezone", () => {
    const baseline = inTimeZone("UTC", () => stable(buildICS(trip, events, "planpal.test")));
    for (const tz of TRAVEL_ZONES) {
      expect(inTimeZone(tz, () => stable(buildICS(trip, events, "planpal.test"))), `feed differs in ${tz}`).toBe(
        baseline
      );
    }
  });

  it("writes timed events as floating values with no UTC marker", () => {
    for (const tz of TRAVEL_ZONES) {
      const ics = inTimeZone(tz, () => buildICS(trip, events, "planpal.test"));
      expect(ics, `in ${tz}`).toContain("DTSTART:20260805T001500\r\n");
      expect(ics, `in ${tz}`).toContain("DTEND:20260805T014500\r\n");
      expect(ics, `in ${tz}`).toContain("DTSTART:20260805T234500\r\n");
      expect(ics, `in ${tz}`).toContain("DTEND:20260806T003000\r\n");
      expect(ics, `in ${tz}`).not.toMatch(/^DTSTART:\d{8}T\d{6}Z/m);
      expect(ics, `in ${tz}`).not.toMatch(/^DTEND:\d{8}T\d{6}Z/m);
    }
  });

  it("keeps DTSTAMP and LAST-MODIFIED in UTC — those really are instants", () => {
    const ics = inTimeZone("Pacific/Kiritimati", () =>
      buildICS(trip, [event({ updated_at: "2026-07-01T08:30:00Z" })], "planpal.test")
    );
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("LAST-MODIFIED:20260701T083000Z");
  });

  it("keeps all-day dates on their own days from every timezone", () => {
    for (const tz of TRAVEL_ZONES) {
      const ics = inTimeZone(tz, () => buildICS(trip, events, "planpal.test"));
      expect(ics, `stay check-in in ${tz}`).toContain("DTSTART;VALUE=DATE:20260803\r\n");
      expect(ics, `stay check-out+1 in ${tz}`).toContain("DTEND;VALUE=DATE:20260809\r\n");
      expect(ics, `trip span in ${tz}`).toContain("DTSTART;VALUE=DATE:20260803\r\n");
      expect(ics, `trip span end in ${tz}`).toContain("DTEND;VALUE=DATE:20260810\r\n");
    }
  });

  it("reads a legacy row stored with a +00:00 offset as the same clock reading", () => {
    for (const tz of TRAVEL_ZONES) {
      const ics = inTimeZone(tz, () =>
        buildICS(trip, [event({ start_at: "2026-08-05T10:00:00+00:00", end_at: null })], "planpal.test")
      );
      expect(ics, `in ${tz}`).toContain("DTSTART:20260805T100000\r\n");
    }
  });
});

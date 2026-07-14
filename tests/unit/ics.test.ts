import { describe, it, expect } from "vitest";
import { buildICS } from "@/lib/ics";
import type { TripEvent } from "@/lib/types";

function event(overrides: Partial<TripEvent> = {}): TripEvent {
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

  it("renders timed events with UTC DTSTART/DTEND", () => {
    const ics = buildICS({ id: "trip-1", name: "Trip" },[event()], "example.com");
    expect(ics).toContain("DTSTART:20260801T100000Z");
    expect(ics).toContain("DTEND:20260801T120000Z");
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

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { vi } from "vitest";
import EventDetail from "@/components/EventDetail";
import WeekView from "@/components/calendar/WeekView";
import { buildICS } from "@/lib/ics";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

// ---------------------------------------------------------------------------
// The regression suite for "times must never move".
//
// Everything below renders the *same* trip data in every zone in the matrix
// and demands byte-identical output. Not "close enough" — identical. If any
// code path ever routes an event time through the device's timezone again,
// one of these zones will disagree with the UTC baseline and this file fails.
//
// The times in the fixture are chosen to be the ones that break first:
// just-after-midnight, just-before-midnight, an event that runs past midnight,
// and a time that falls in a DST gap in one of the zones.
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TripEvent> & { id: string }): TripEvent {
  return {
    trip_id: "trip-1",
    title: "Event",
    type: "activity",
    start_at: "2026-08-05T12:00:00Z",
    end_at: null,
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: false,
    ...overrides
  };
}

const EVENTS: TripEvent[] = [
  makeEvent({
    id: "early",
    title: "Sunrise walk",
    // 00:15 is the case a zone behind UTC used to drag into the previous day.
    start_at: "2026-08-05T00:15:00Z",
    end_at: "2026-08-05T01:45:00Z",
    location: "Villa Borghese"
  }),
  makeEvent({
    id: "dinner",
    title: "Dinner at Da Enzo",
    start_at: "2026-08-05T19:00:00Z",
    end_at: "2026-08-05T21:30:00Z",
    location: "Trastevere",
    description: "Book a table"
  }),
  makeEvent({
    id: "late",
    title: "Night train",
    type: "travel",
    // 23:30 is the case a zone ahead of UTC used to push into the next day,
    // and the leg itself runs past midnight.
    start_at: "2026-08-06T23:30:00Z",
    end_at: "2026-08-07T07:15:00Z",
    location: "Roma Termini",
    end_location: "Wien Hbf"
  }),
  makeEvent({
    id: "festival",
    title: "Street festival",
    all_day: true,
    start_at: "2026-08-04T00:00:00Z",
    end_at: "2026-08-06T00:00:00Z"
  }),
  makeEvent({
    id: "stay",
    title: "Hotel Roma",
    type: "accommodation",
    start_at: "2026-08-03T00:00:00Z",
    end_at: "2026-08-08T00:00:00Z",
    location: "Via del Corso 1"
  })
];

// Built fresh inside each zone, the way the app builds them: a `Date` is an
// instant, so one constructed in one zone and read in another names a
// different calendar day. Reusing a single module-scope value here would test
// a situation the app never produces.
const weekProps = () => ({
  weekStart: new Date(2026, 7, 3), // Mon 3 Aug 2026
  rangeStart: new Date(2026, 7, 3),
  rangeEnd: new Date(2026, 7, 9)
});

beforeAll(() => {
  // Pin "now" so the calendar's today-highlight can't make the comparison
  // depend on the day the suite happens to run. Only Date is faked, so
  // React's scheduling and testing-library keep working normally.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-15T12:00:00Z") });
});

afterEach(cleanup);

afterAll(() => {
  vi.useRealTimers();
  restoreTimeZone();
});

/**
 * Render `ui` in every zone and return the markup, keyed by zone. Cleanup runs
 * between zones so each render starts from an empty document.
 */
function renderInEveryZone(ui: () => React.ReactElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tz of TRAVEL_ZONES) {
    out[tz] = inTimeZone(tz, () => {
      const { container } = render(ui());
      const html = container.innerHTML;
      cleanup();
      return html;
    });
  }
  return out;
}

function expectIdenticalAcrossZones(byZone: Record<string, string>): string {
  const baseline = byZone.UTC;
  for (const [tz, html] of Object.entries(byZone)) {
    expect(html === baseline, `${tz} rendered differently than UTC`).toBe(true);
  }
  return baseline;
}

describe("event times never move with the device's timezone", () => {
  describe("EventDetail", () => {
    for (const event of EVENTS) {
      it(`renders "${event.title}" identically in every zone`, () => {
        const html = expectIdenticalAcrossZones(
          renderInEveryZone(() => (
            <EventDetail event={event} canEdit={false} onClose={() => {}} onEdit={() => {}} />
          ))
        );
        expect(html).toContain(event.title);
      });
    }

    it("shows the timed events at the hours they were entered", () => {
      for (const tz of TRAVEL_ZONES) {
        inTimeZone(tz, () => {
          const { getByText } = render(
            <EventDetail event={EVENTS[0]} canEdit={false} onClose={() => {}} onEdit={() => {}} />
          );
          expect(getByText("Wed 5 Aug 2026, 00:15 – 01:45"), `in ${tz}`).toBeInTheDocument();
          cleanup();
        });
      }
    });

    it("keeps a 23:30 start on its own evening rather than tipping into the next day", () => {
      for (const tz of TRAVEL_ZONES) {
        inTimeZone(tz, () => {
          const { getByText } = render(
            <EventDetail event={EVENTS[2]} canEdit={false} onClose={() => {}} onEdit={() => {}} />
          );
          expect(getByText("Thu 6 Aug 2026, 23:30 – Fri 7 Aug 2026, 07:15"), `in ${tz}`).toBeInTheDocument();
          cleanup();
        });
      }
    });

    it("keeps an all-day range on the dates it was given", () => {
      for (const tz of TRAVEL_ZONES) {
        inTimeZone(tz, () => {
          const { getByText } = render(
            <EventDetail event={EVENTS[3]} canEdit={false} onClose={() => {}} onEdit={() => {}} />
          );
          expect(getByText("Tue 4 Aug → Thu 6 Aug 2026"), `in ${tz}`).toBeInTheDocument();
          cleanup();
        });
      }
    });
  });

  describe("WeekView", () => {
    it("renders the whole week identically in every zone", () => {
      const html = expectIdenticalAcrossZones(
        renderInEveryZone(() => (
          <WeekView {...weekProps()} events={EVENTS} />
        ))
      );
      // Sanity: the comparison above would also pass on an empty render.
      expect(html).toContain("Dinner at Da Enzo");
      expect(html).toContain("Night train");
      expect(html).toContain("Hotel Roma");
    });

    it("labels every timed event with the clock reading it was given", () => {
      for (const tz of TRAVEL_ZONES) {
        inTimeZone(tz, () => {
          const { getAllByText } = render(
            <WeekView {...weekProps()} events={EVENTS} />
          );
          expect(getAllByText("00:15–01:45").length, `in ${tz}`).toBeGreaterThan(0);
          expect(getAllByText("19:00–21:30").length, `in ${tz}`).toBeGreaterThan(0);
          expect(getAllByText("23:30–07:15").length, `in ${tz}`).toBeGreaterThan(0);
          cleanup();
        });
      }
    });

    it("keeps each event in the same day column in every zone", () => {
      const columnsByZone = Object.fromEntries(
        TRAVEL_ZONES.map((tz) => [
          tz,
          inTimeZone(tz, () => {
            const { container } = render(
              <WeekView {...weekProps()} events={EVENTS} />
            );
            // The agenda (mobile) view groups by day, so the order of titles
            // in the document is the day-by-day plan.
            const titles = Array.from(container.querySelectorAll(".sm\\:hidden .card")).map((card) =>
              Array.from(card.querySelectorAll("span.font-semibold, span.truncate"))
                .map((n) => n.textContent)
                .join("|")
            );
            cleanup();
            return titles;
          })
        ])
      );
      for (const [tz, cols] of Object.entries(columnsByZone)) {
        expect(cols, `day grouping differs in ${tz}`).toEqual(columnsByZone.UTC);
      }
      expect(columnsByZone.UTC.join("\n")).toContain("Sunrise walk");
    });

    it("positions and sizes the time-grid blocks identically in every zone", () => {
      const geometryByZone = Object.fromEntries(
        TRAVEL_ZONES.map((tz) => [
          tz,
          inTimeZone(tz, () => {
            const { container } = render(
              <WeekView {...weekProps()} events={EVENTS} />
            );
            const blocks = Array.from(container.querySelectorAll<HTMLElement>("button.absolute")).map((b) => ({
              text: b.textContent,
              top: b.style.top,
              height: b.style.height
            }));
            cleanup();
            return blocks;
          })
        ])
      );
      for (const [tz, blocks] of Object.entries(geometryByZone)) {
        expect(blocks, `block geometry differs in ${tz}`).toEqual(geometryByZone.UTC);
      }
      // 19:00 with START_HOUR 6 and HOUR_PX 44 -> (19-6)*44 = 572px down,
      // 2.5 hours tall -> 110px. Hard-coded so a silent offset can't slip in.
      const dinner = geometryByZone.UTC.find((b) => b.text?.includes("Dinner at Da Enzo"));
      expect(dinner).toMatchObject({ top: "572px", height: "110px" });
    });
  });

  describe("the .ics feed", () => {
    const trip = { id: "trip-1", name: "Rome 2026", start_date: "2026-08-03", end_date: "2026-08-09" };

    it("produces an identical feed in every zone", () => {
      const feeds = Object.fromEntries(
        TRAVEL_ZONES.map((tz) => [tz, inTimeZone(tz, () => buildICS(trip, EVENTS, "planpal.test"))])
      );
      for (const [tz, feed] of Object.entries(feeds)) {
        expect(feed, `feed differs in ${tz}`).toBe(feeds.UTC);
      }
    });

    it("exports the times as floating values, exactly as entered", () => {
      const feed = inTimeZone("Pacific/Kiritimati", () => buildICS(trip, EVENTS, "planpal.test"));
      expect(feed).toContain("DTSTART:20260805T001500\r\n");
      expect(feed).toContain("DTEND:20260805T014500\r\n");
      expect(feed).toContain("DTSTART:20260805T190000\r\n");
      expect(feed).toContain("DTEND:20260805T213000\r\n");
      expect(feed).toContain("DTSTART:20260806T233000\r\n");
      expect(feed).toContain("DTEND:20260807T071500\r\n");
      // No timed value may carry a UTC marker; DTSTAMP is the only Z in a feed.
      expect(feed).not.toMatch(/^DTSTART:\d{8}T\d{6}Z/m);
      expect(feed).not.toMatch(/^DTEND:\d{8}T\d{6}Z/m);
    });

    it("keeps all-day dates and the trip span on their own days", () => {
      const feed = inTimeZone("Pacific/Niue", () => buildICS(trip, EVENTS, "planpal.test"));
      expect(feed).toContain("DTSTART;VALUE=DATE:20260804\r\n"); // festival start
      expect(feed).toContain("DTEND;VALUE=DATE:20260807\r\n"); // festival end + 1
      expect(feed).toContain("DTSTART;VALUE=DATE:20260803\r\n"); // stay check-in
      expect(feed).toContain("DTEND;VALUE=DATE:20260809\r\n"); // stay check-out + 1
      expect(feed).toContain("DTEND;VALUE=DATE:20260810\r\n"); // trip span end + 1
    });
  });

  describe("legacy rows written before the fix", () => {
    // Rows created by the old code came back from PostgREST with a "+00:00"
    // offset. They must read as the same wall clock the old app showed their
    // author, and must not vary by viewer.
    const legacy = makeEvent({
      id: "legacy",
      title: "Legacy lunch",
      start_at: "2026-08-05T11:30:00+00:00",
      end_at: "2026-08-05T13:00:00+00:00"
    });

    it("renders a legacy value identically in every zone", () => {
      expectIdenticalAcrossZones(
        renderInEveryZone(() => (
          <EventDetail event={legacy} canEdit={false} onClose={() => {}} onEdit={() => {}} />
        ))
      );
    });

    it("reads a legacy value as the clock reading it stored", () => {
      inTimeZone("Asia/Kathmandu", () => {
        const { getByText } = render(
          <EventDetail event={legacy} canEdit={false} onClose={() => {}} onEdit={() => {}} />
        );
        expect(getByText("Wed 5 Aug 2026, 11:30 – 13:00")).toBeInTheDocument();
      });
    });
  });
});

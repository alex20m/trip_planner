import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import WeekView from "@/components/calendar/WeekView";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

// Monday 2026-08-03 .. Sunday 2026-08-09
const weekStart = new Date("2026-08-03T00:00:00");

function makeEvent(overrides: Partial<TripEvent>): TripEvent {
  return {
    id: "e1",
    trip_id: "t1",
    title: "Museum",
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

describe("WeekView", () => {
  it("only renders days inside the trip's date range, even though the week spans further", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    // Wed 5, Thu 6, Fri 7 are in range and should show up (agenda view renders "d MMM").
    expect(screen.getAllByText("5 Aug").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 Aug").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7 Aug").length).toBeGreaterThan(0);

    // Mon 3, Tue 4, Sat 8, Sun 9 are outside the trip range and must not render.
    expect(screen.queryByText("3 Aug")).not.toBeInTheDocument();
    expect(screen.queryByText("4 Aug")).not.toBeInTheDocument();
    expect(screen.queryByText("8 Aug")).not.toBeInTheDocument();
    expect(screen.queryByText("9 Aug")).not.toBeInTheDocument();
  });

  it("still shows an event that falls on an in-range day", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[makeEvent({ title: "Museum visit", start_at: "2026-08-06T12:00:00Z" })]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    expect(screen.getAllByText("Museum visit").length).toBeGreaterThan(0);
  });

  it("shows the event's note on the agenda card", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[makeEvent({ start_at: "2026-08-06T12:00:00Z", description: "Bring the tickets" })]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    expect(screen.getAllByText("Bring the tickets").length).toBeGreaterThan(0);
  });

  it("hides the note in the time grid when the event is too short to fit it", () => {
    // 30-minute event → ~22px block: the note must be dropped, not stretch the block.
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            start_at: "2026-08-06T12:00:00Z",
            end_at: "2026-08-06T12:30:00Z",
            description: "Reservation under Alex"
          })
        ]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    // The agenda card still shows the note (its layout isn't time-scaled),
    // so exactly one copy renders — none inside the time grid.
    expect(screen.getAllByText("Reservation under Alex")).toHaveLength(1);
  });

  it("shows the note in the time grid when the event is long enough", () => {
    // 2-hour event → 88px block: room for the truncated note line.
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            start_at: "2026-08-06T12:00:00Z",
            end_at: "2026-08-06T14:00:00Z",
            description: "Reservation under Alex"
          })
        ]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    // One copy on the agenda card, one inside the time grid.
    expect(screen.getAllByText("Reservation under Alex")).toHaveLength(2);
  });

  it("shows an all-day activity in the All day row, not the hourly time grid", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            title: "City walking tour",
            type: "activity",
            all_day: true,
            start_at: "2026-08-06T00:00:00Z",
            end_at: null
          })
        ]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.getAllByText("City walking tour").length).toBeGreaterThan(0);
    // Not rendered as a timed block: no HH:mm label like a normal timed event would get.
    expect(screen.queryByText(/00:00/)).not.toBeInTheDocument();
  });

  it("shows a stay's note on its agenda card", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            type: "accommodation",
            title: "Hotel Aurora",
            start_at: "2026-08-05T00:00:00Z",
            end_at: "2026-08-07T00:00:00Z",
            description: "Check-in from 15:00"
          })
        ]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    expect(screen.getAllByText(/Check-in from 15:00/).length).toBeGreaterThan(0);
  });

  it("shows a stay's location in the preview without opening the event", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            id: "stay1",
            title: "Hotel Sunrise",
            type: "accommodation",
            start_at: "2026-08-05T12:00:00Z",
            end_at: "2026-08-07T10:00:00Z",
            location: "123 Beach Road"
          })
        ]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    // Location text appears in the stay preview (agenda + time-grid views) without a modal.
    expect(screen.getAllByText(/123 Beach Road/).length).toBeGreaterThan(0);
  });

  it("shows a stay on its check-in day regardless of local timezone, but not on its check-out day", () => {
    // Regression test: accommodation start_at/end_at are stored as UTC-midnight
    // date-only values. In a timezone ahead of UTC (e.g. Europe/Stockholm),
    // `new Date(iso)` for a UTC midnight lands after local midnight, so a naive
    // `stayStart <= day` comparison used to drop the stay from its check-in day.
    // The check-out day itself shows no stay: no night is spent there (issue #68).
    const originalTz = process.env.TZ;
    process.env.TZ = "Europe/Stockholm";
    try {
      render(
        <WeekView
          weekStart={new Date("2026-07-27T00:00:00")}
          events={[
            makeEvent({
              id: "stay-tz",
              type: "accommodation",
              title: "Sov i Tornea",
              start_at: "2026-07-31T00:00:00Z",
              end_at: "2026-08-01T00:00:00Z"
            })
          ]}
          rangeStart={new Date("2026-07-27T00:00:00")}
          rangeEnd={new Date("2026-08-02T00:00:00")}
        />
      );

      const daysShown = agendaDaysShowing("Sov i Tornea");
      expect(daysShown).toContain("31 Jul");
      expect(daysShown).not.toContain("1 Aug");
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("shows a stay on every day it covers except the check-out day (issue #68)", () => {
    // Stay 3.8–6.8 → shown on 3, 4 and 5 Aug; the 6th is check-out, no night there.
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            id: "stay1",
            type: "accommodation",
            title: "Hotel Aurora",
            start_at: "2026-08-03T00:00:00Z",
            end_at: "2026-08-06T00:00:00Z"
          })
        ]}
        rangeStart={new Date("2026-08-03T00:00:00")}
        rangeEnd={new Date("2026-08-09T00:00:00")}
      />
    );

    const daysShown = agendaDaysShowing("Hotel Aurora");
    expect(daysShown).toEqual(["3 Aug", "4 Aug", "5 Aug"]);
  });

  it("renders the stay as the last event of the day in the agenda (issue #68)", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            id: "stay1",
            type: "accommodation",
            title: "Hotel Aurora",
            start_at: "2026-08-03T00:00:00Z",
            end_at: "2026-08-06T00:00:00Z"
          }),
          makeEvent({ id: "walk", title: "City walk", all_day: true, start_at: "2026-08-04T00:00:00Z" }),
          makeEvent({ id: "museum", title: "Museum", start_at: "2026-08-04T12:00:00Z" }),
          makeEvent({ id: "dinner", title: "Dinner", start_at: "2026-08-04T19:00:00Z" })
        ]}
        rangeStart={new Date("2026-08-03T00:00:00")}
        rangeEnd={new Date("2026-08-09T00:00:00")}
      />
    );

    const dayCard = Array.from(document.querySelectorAll(".card.overflow-hidden")).find((card) =>
      card.textContent?.includes("4 Aug")
    )!;
    const titles = Array.from(dayCard.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(titles.length).toBe(4);
    expect(titles[titles.length - 1]).toContain("Hotel Aurora");
    // Timed events stay in chronological order before the stay.
    expect(titles.findIndex((t) => t.includes("Museum"))).toBeLessThan(titles.findIndex((t) => t.includes("Dinner")));
  });

  it("gives every all-day chip in the week grid an explicit compact lane (issue #67)", () => {
    // Two long chips overlap; the short one fits next to the second chip.
    // Grid auto-placement used to push it to a third row, leaving an uneven
    // blank gap in its day column.
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({ id: "a", title: "Chip A", all_day: true, start_at: "2026-08-03T00:00:00Z", end_at: "2026-08-05T00:00:00Z" }),
          makeEvent({ id: "b", title: "Chip B", all_day: true, start_at: "2026-08-04T00:00:00Z", end_at: "2026-08-06T00:00:00Z" }),
          makeEvent({ id: "c", title: "Chip C", all_day: true, start_at: "2026-08-03T00:00:00Z" })
        ]}
        rangeStart={new Date("2026-08-03T00:00:00")}
        rangeEnd={new Date("2026-08-09T00:00:00")}
      />
    );

    const rows = Object.fromEntries(
      ["Chip A", "Chip B", "Chip C"].map((title) => {
        // Chips render in the desktop week strip; agenda copies are plain full-width cards.
        const chip = screen
          .getAllByText(title)
          .map((el) => el.closest("button")!)
          .find((b) => b.style.gridRow !== "");
        return [title, chip?.style.gridRow];
      })
    );
    expect(rows["Chip A"]).toBe("1");
    expect(rows["Chip B"]).toBe("2");
    expect(rows["Chip C"]).toBe("2");
  });

  it("shows a travel leg's start and end destination, with the direction of travel, on its cards (issue #69)", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[
          makeEvent({
            id: "leg",
            type: "travel",
            title: "Train north",
            start_at: "2026-08-04T09:00:00Z",
            location: "Helsinki",
            end_location: "Oulu"
          })
        ]}
        rangeStart={new Date("2026-08-03T00:00:00")}
        rangeEnd={new Date("2026-08-09T00:00:00")}
      />
    );

    // Both endpoints render, joined by a direction arrow kept as its own
    // element so it stays visible even when the place names truncate.
    expect(screen.getAllByText("Helsinki").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Oulu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("→").length).toBeGreaterThan(0);
    // The route is exposed to assistive tech as "Helsinki to Oulu".
    expect(screen.getAllByLabelText("Helsinki to Oulu").length).toBeGreaterThan(0);
  });

  it("lets the user press an empty day to start a new event on that day", () => {
    const onAddEvent = vi.fn();
    render(
      <WeekView
        weekStart={weekStart}
        events={[]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
        onAddEvent={onAddEvent}
      />
    );

    // Agenda header and week-grid header are both press targets for the day.
    const targets = screen.getAllByLabelText("Add event on 6 Aug");
    expect(targets.length).toBe(2);
    fireEvent.click(targets[0]);

    expect(onAddEvent).toHaveBeenCalledTimes(1);
    const [day, hour] = onAddEvent.mock.calls[0];
    expect(day).toEqual(new Date("2026-08-06T00:00:00"));
    expect(hour).toBeUndefined();
  });

  it("also lets the user press a day that already has events", () => {
    const onAddEvent = vi.fn();
    render(
      <WeekView
        weekStart={weekStart}
        events={[makeEvent({ title: "Museum visit", start_at: "2026-08-06T12:00:00Z" })]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
        onAddEvent={onAddEvent}
      />
    );

    fireEvent.click(screen.getAllByLabelText("Add event on 6 Aug")[0]);
    expect(onAddEvent).toHaveBeenCalledWith(new Date("2026-08-06T00:00:00"));
  });

  it("starts a new event at the clicked hour when free grid space is pressed", () => {
    const onAddEvent = vi.fn();
    render(
      <WeekView
        weekStart={weekStart}
        events={[]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
        onAddEvent={onAddEvent}
      />
    );

    // Column top sits at y=0 in jsdom; a click 2 hour-rows down (2 × 44px)
    // lands on the 08:00 slot (the grid starts at 06:00).
    fireEvent.click(screen.getByTitle("Add event on 6 Aug"), { clientY: 2 * 44 + 1 });
    expect(onAddEvent).toHaveBeenCalledWith(new Date("2026-08-06T00:00:00"), 8);
  });

  it("keeps a press on an event block opening that event, not the composer", () => {
    const onAddEvent = vi.fn();
    const onSelect = vi.fn();
    const event = makeEvent({ title: "Museum visit", start_at: "2026-08-06T12:00:00Z", end_at: "2026-08-06T14:00:00Z" });
    render(
      <WeekView
        weekStart={weekStart}
        events={[event]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
        onSelect={onSelect}
        onAddEvent={onAddEvent}
      />
    );

    // The time-grid copy of the event lives inside the clickable day column.
    const gridBlock = screen
      .getAllByText("Museum visit")
      .map((el) => el.closest("button")!)
      .find((b) => b.closest("[title='Add event on 6 Aug']"))!;
    fireEvent.click(gridBlock);

    expect(onSelect).toHaveBeenCalledWith(event);
    expect(onAddEvent).not.toHaveBeenCalled();
  });

  it("shows no add-event press targets without edit rights", () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[]}
        rangeStart={new Date("2026-08-05T00:00:00")}
        rangeEnd={new Date("2026-08-07T00:00:00")}
      />
    );

    expect(screen.queryByLabelText(/add event on/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/add event on/i)).not.toBeInTheDocument();
  });
});

// Day labels ("d MMM") of the agenda day cards containing the given text.
// Scoped to .overflow-hidden so the desktop week-grid card (which also has
// .card) doesn't leak into the result.
function agendaDaysShowing(text: string): string[] {
  return Array.from(document.querySelectorAll(".card.overflow-hidden"))
    .filter((card) => card.textContent?.includes(text))
    .map((card) => card.querySelector(".text-sm.font-semibold")?.textContent ?? "");
}

// ---------------------------------------------------------------------------
// The calendar must put every event on the same day, at the same height, with
// the same label, no matter where the device is.
// ---------------------------------------------------------------------------
describe("WeekView is timezone-independent", () => {
  afterAll(restoreTimeZone);

  // Rebuilt per zone: a `Date` is an instant, and the app likewise derives
  // these fresh from the trip's dates in whatever zone it is currently in.
  const props = () => ({
    weekStart: new Date(2026, 7, 3),
    rangeStart: new Date(2026, 7, 3),
    rangeEnd: new Date(2026, 7, 9)
  });

  const events = [
    makeEvent({ id: "a", title: "Sunrise walk", start_at: "2026-08-05T00:15:00Z", end_at: "2026-08-05T01:45:00Z" }),
    makeEvent({ id: "b", title: "Dinner", start_at: "2026-08-05T19:00:00Z", end_at: "2026-08-05T21:30:00Z" }),
    makeEvent({ id: "c", title: "Last call", start_at: "2026-08-05T23:45:00Z", end_at: "2026-08-06T00:30:00Z" }),
    makeEvent({ id: "d", title: "Monday brunch", start_at: "2026-08-03T00:30:00Z" }),
    makeEvent({ id: "e", title: "Sunday send-off", start_at: "2026-08-09T23:30:00Z" })
  ];

  it("labels every event with the clock reading it was saved with", () => {
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        render(<WeekView {...props()} events={events} />);
        expect(screen.getAllByText("00:15–01:45").length, `in ${tz}`).toBeGreaterThan(0);
        expect(screen.getAllByText("19:00–21:30").length, `in ${tz}`).toBeGreaterThan(0);
        expect(screen.getAllByText("23:45–00:30").length, `in ${tz}`).toBeGreaterThan(0);
        cleanup();
      });
    }
  });

  it("keeps the first and last day of the week inside the week", () => {
    // A 00:30 Monday and a 23:30 Sunday are the two events a zone shift used
    // to push out of the visible week entirely.
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        render(<WeekView {...props()} events={events} />);
        expect(screen.getAllByText("Monday brunch").length, `Monday in ${tz}`).toBeGreaterThan(0);
        expect(screen.getAllByText("Sunday send-off").length, `Sunday in ${tz}`).toBeGreaterThan(0);
        cleanup();
      });
    }
  });

  it("places each event under the same day heading in every zone", () => {
    const grouping = (tz: string) =>
      inTimeZone(tz, () => {
        const { container } = render(<WeekView {...props()} events={events} />);
        const cards = Array.from(container.querySelectorAll(".sm\\:hidden > .card")).map((card) =>
          (card.textContent ?? "").replace(/\s+/g, " ").trim()
        );
        cleanup();
        return cards;
      });
    const baseline = grouping("UTC");
    for (const tz of TRAVEL_ZONES) {
      expect(grouping(tz), `day grouping differs in ${tz}`).toEqual(baseline);
    }
    expect(baseline[0]).toContain("Monday brunch");
    expect(baseline[2]).toContain("Sunrise walk");
    expect(baseline[6]).toContain("Sunday send-off");
  });

  it("positions and sizes the time-grid blocks identically in every zone", () => {
    const geometry = (tz: string) =>
      inTimeZone(tz, () => {
        const { container } = render(<WeekView {...props()} events={events} />);
        const blocks = Array.from(container.querySelectorAll<HTMLElement>("button.absolute")).map((b) => [
          b.textContent?.slice(0, 20),
          b.style.top,
          b.style.height
        ]);
        cleanup();
        return blocks;
      });
    const baseline = geometry("UTC");
    for (const tz of TRAVEL_ZONES) {
      expect(geometry(tz), `geometry differs in ${tz}`).toEqual(baseline);
    }
    // 19:00 is 13 hours past the grid's 06:00 start: 13 * 44px.
    expect(baseline.find((b) => b[0]?.includes("Dinner"))).toEqual(["Dinner19:00–21:30", "572px", "110px"]);
  });

  it("does not squash an event that runs over a DST transition", () => {
    const overnight = makeEvent({
      id: "dst",
      title: "Spring forward",
      start_at: "2026-03-29T01:00:00Z",
      end_at: "2026-03-29T05:00:00Z"
    });
    const dstProps = () => ({
      weekStart: new Date(2026, 2, 23),
      rangeStart: new Date(2026, 2, 23),
      rangeEnd: new Date(2026, 2, 29)
    });
    const heights = TRAVEL_ZONES.map((tz) =>
      inTimeZone(tz, () => {
        const { container } = render(<WeekView {...dstProps()} events={[overnight]} />);
        const block = container.querySelector<HTMLElement>("button.absolute");
        const height = block?.style.height;
        cleanup();
        return height;
      })
    );
    // Four hours on the clock, whatever the zone did that night: 4 * 44px.
    expect(new Set(heights)).toEqual(new Set(["176px"]));
  });

  it("reads legacy rows stored with a +00:00 offset at the same times", () => {
    const legacy = [makeEvent({ id: "l", title: "Legacy lunch", start_at: "2026-08-05T12:00:00+00:00" })];
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        render(<WeekView {...props()} events={legacy} />);
        expect(screen.getAllByText("12:00").length, `in ${tz}`).toBeGreaterThan(0);
        cleanup();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Landing on today's week is only useful if today is actually on screen: on a
// phone the week is a stack of day cards, and today can start well below the
// fold. Dates here are relative to the day the suite runs on.
// ---------------------------------------------------------------------------
describe("WeekView — bringing today into view", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    // jsdom has no layout, so it does not implement scrollIntoView at all.
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
  const thisWeek = () => mondayOf(new Date());

  it("scrolls today's day card into view when the week on screen contains today", () => {
    render(
      <WeekView
        weekStart={thisWeek()}
        events={[]}
        rangeStart={addDays(thisWeek(), -30)}
        rangeEnd={addDays(thisWeek(), 30)}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // Called on today's card, not on some other day's.
    const card = scrollIntoView.mock.instances[0] as HTMLElement;
    expect(card).toHaveTextContent(format(new Date(), "d MMM", { locale: enUS }));
  });

  it("leaves the page where it is when today is not in the week on screen", () => {
    const nextWeek = addDays(thisWeek(), 7);
    render(
      <WeekView weekStart={nextWeek} events={[]} rangeStart={nextWeek} rangeEnd={addDays(nextWeek, 6)} />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves the page where it is when today's week is outside the trip's range", () => {
    // The week contains today, but the trip only covers days after it, so no
    // card for today is rendered.
    render(
      <WeekView
        weekStart={thisWeek()}
        events={[]}
        rangeStart={addDays(new Date(), 1)}
        rangeEnd={addDays(new Date(), 20)}
      />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll again when the reader pages to another week", () => {
    const { rerender } = render(
      <WeekView
        weekStart={thisWeek()}
        events={[]}
        rangeStart={addDays(thisWeek(), -30)}
        rangeEnd={addDays(thisWeek(), 30)}
      />
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // Paging forward and back again must not yank the page around.
    rerender(
      <WeekView
        weekStart={addDays(thisWeek(), 7)}
        events={[]}
        rangeStart={addDays(thisWeek(), -30)}
        rangeEnd={addDays(thisWeek(), 30)}
      />
    );
    rerender(
      <WeekView
        weekStart={thisWeek()}
        events={[]}
        rangeStart={addDays(thisWeek(), -30)}
        rangeEnd={addDays(thisWeek(), 30)}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The layout effect can only run once React has hydrated, which on a full page
// load is long after the calendar's HTML has been painted — so the same
// positioning also ships as a script that runs while the markup is parsed.
// It is a string, never type-checked, so these tests run it for real.
// ---------------------------------------------------------------------------
describe("WeekView — positioning before hydration", () => {
  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  const weekProps = () => ({
    weekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
    events: [],
    rangeStart: addDays(new Date(), -30),
    rangeEnd: addDays(new Date(), 30)
  });

  // The script finds today by attribute; nothing else links the two.
  it("labels every agenda card with its calendar day", () => {
    const { container } = render(<WeekView {...weekProps()} />);

    const labelled = Array.from(container.querySelectorAll("[data-agenda-day]"), (el) =>
      el.getAttribute("data-agenda-day")
    );
    expect(labelled).toHaveLength(7);
    expect(labelled).toContain(dayKey(new Date()));
  });

  it("scrolls today's card into view when run against the rendered markup", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(<WeekView {...weekProps()} />);

    const today = container.querySelector<HTMLElement>(`[data-agenda-day="${dayKey(new Date())}"]`)!;
    // jsdom does no layout, so every element reports itself as unrendered.
    // The agenda is the visible layout on a phone, which is what this covers.
    Object.defineProperty(today, "offsetParent", { configurable: true, value: document.body });
    scrollIntoView.mockClear();

    const script = container.querySelector("script")!;
    new Function(script.innerHTML)();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances[0]).toBe(today);
  });

  it("does nothing when the agenda is the layout that is hidden", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(<WeekView {...weekProps()} />);
    scrollIntoView.mockClear();

    // No offsetParent stub: from the script's point of view the agenda cards
    // are in a `display: none` subtree, exactly as they are on a wide screen.
    new Function(container.querySelector("script")!.innerHTML)();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when the week on screen does not contain today", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const nextWeek = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7);
    const { container } = render(
      <WeekView weekStart={nextWeek} events={[]} rangeStart={nextWeek} rangeEnd={addDays(nextWeek, 6)} />
    );
    container.querySelectorAll("[data-agenda-day]").forEach((card) => {
      Object.defineProperty(card, "offsetParent", { configurable: true, value: document.body });
    });
    scrollIntoView.mockClear();

    new Function(container.querySelector("script")!.innerHTML)();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

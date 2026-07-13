import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WeekView from "@/components/calendar/WeekView";
import type { TripEvent } from "@/lib/types";

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

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    description: null,
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
});

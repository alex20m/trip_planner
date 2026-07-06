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
});

import { describe, it, expect, vi, afterAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventDetail from "@/components/EventDetail";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "e1",
    trip_id: "t1",
    title: "Museum visit",
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

describe("EventDetail", () => {
  it("shows the event details read-only", () => {
    render(
      <EventDetail
        event={makeEvent({ location: "Vatican", title: "Museum visit" })}
        canEdit
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("Museum visit")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Vatican")).toBeInTheDocument();
    // Read-only: no form fields.
    expect(screen.queryByPlaceholderText("Title")).not.toBeInTheDocument();
  });

  it("renders the check-in and check-out range for a stay", () => {
    render(
      <EventDetail
        event={makeEvent({
          type: "accommodation",
          title: "Hotel Rome",
          start_at: "2026-08-05T00:00:00Z",
          end_at: "2026-08-08T00:00:00Z"
        })}
        canEdit={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    // Dates come straight off the ISO string, unaffected by the local zone.
    expect(screen.getByText(/5 Aug.*8 Aug 2026/)).toBeInTheDocument();
    expect(screen.getByText("Stay")).toBeInTheDocument();
  });

  it("shows a travel leg's destinations as From and To (issue #69)", () => {
    render(
      <EventDetail
        event={makeEvent({
          type: "travel",
          title: "Train north",
          location: "Helsinki",
          end_location: "Oulu"
        })}
        canEdit={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("Helsinki")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByText("Oulu")).toBeInTheDocument();
    expect(screen.queryByText("Where")).not.toBeInTheDocument();
  });

  it("falls back to Where for a legacy travel event without an end destination", () => {
    render(
      <EventDetail
        event={makeEvent({ type: "travel", title: "Old flight", location: "Helsinki Airport" })}
        canEdit={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(screen.getByText("Helsinki Airport")).toBeInTheDocument();
  });

  it("shows an Edit button only when the viewer can edit", async () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <EventDetail event={makeEvent()} canEdit={false} onClose={vi.fn()} onEdit={onEdit} />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    rerender(<EventDetail event={makeEvent()} canEdit onClose={vi.fn()} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("closes when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<EventDetail event={makeEvent()} canEdit onClose={onClose} onEdit={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The "When" line is what a traveller checks before leaving the hotel, so it
// is the single most important thing that must not move.
// ---------------------------------------------------------------------------
describe("EventDetail's When line is timezone-independent", () => {
  afterAll(restoreTimeZone);

  const whenLine = (event: TripEvent, tz: string) =>
    inTimeZone(tz, () => {
      render(<EventDetail event={event} canEdit={false} onClose={vi.fn()} onEdit={vi.fn()} />);
      const text = screen.getByText("When").nextElementSibling?.textContent ?? "";
      cleanup();
      return text;
    });

  const cases: [string, TripEvent, string][] = [
    ["a midday event", makeEvent({ start_at: "2026-08-05T12:00:00Z" }), "Wed 5 Aug 2026, 12:00"],
    [
      "an event just after midnight",
      makeEvent({ start_at: "2026-08-05T00:15:00Z", end_at: "2026-08-05T01:45:00Z" }),
      "Wed 5 Aug 2026, 00:15 – 01:45"
    ],
    [
      "an event just before midnight",
      makeEvent({ start_at: "2026-08-05T23:45:00Z", end_at: "2026-08-06T00:30:00Z" }),
      "Wed 5 Aug 2026, 23:45 – Thu 6 Aug 2026, 00:30"
    ],
    [
      "a time inside a DST gap",
      makeEvent({ start_at: "2026-03-29T03:30:00Z" }),
      "Sun 29 Mar 2026, 03:30"
    ],
    [
      "an all-day event",
      makeEvent({ all_day: true, start_at: "2026-08-05T00:00:00Z" }),
      "Wed 5 Aug 2026"
    ],
    [
      "an all-day range",
      makeEvent({ all_day: true, start_at: "2026-08-04T00:00:00Z", end_at: "2026-08-06T00:00:00Z" }),
      "Tue 4 Aug → Thu 6 Aug 2026"
    ],
    [
      "a stay",
      makeEvent({ type: "accommodation", start_at: "2026-08-03T00:00:00Z", end_at: "2026-08-08T00:00:00Z" }),
      "Mon 3 Aug → Sat 8 Aug 2026"
    ],
    [
      "a legacy row stored with a +00:00 offset",
      makeEvent({ start_at: "2026-08-05T12:00:00+00:00" }),
      "Wed 5 Aug 2026, 12:00"
    ]
  ];

  for (const [label, event, expected] of cases) {
    it(`reads "${expected}" for ${label} in every timezone`, () => {
      for (const tz of TRAVEL_ZONES) {
        expect(whenLine(event, tz), `in ${tz}`).toBe(expected);
      }
    });
  }
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventDetail from "@/components/EventDetail";
import type { TripEvent } from "@/lib/types";

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

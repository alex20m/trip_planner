import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventModal from "@/components/EventModal";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, restoreTimeZone, setTimeZone } from "../helpers/timezone";

// ---------------------------------------------------------------------------
// The composer half of "times must never move": what the user types is what
// gets written, and what was written is what the editor shows again — from any
// timezone, including one they flew to after creating the event.
// ---------------------------------------------------------------------------

const insertSingle = vi.fn();
const updateSingle = vi.fn();
type Payload = Record<string, unknown>;
const insert = vi.fn((_payload: Payload) => ({ select: () => ({ single: insertSingle }) }));
const update = vi.fn((_payload: Payload) => ({ eq: () => ({ select: () => ({ single: updateSingle }) }) }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ insert, update }) })
}));

const searchPlaces = vi.hoisted(() => vi.fn());
const reverseGeocode = vi.hoisted(() => vi.fn());
vi.mock("@/lib/geocode", () => ({ searchPlaces, reverseGeocode }));

vi.mock("@/components/map/LocationPreviewMap", () => ({
  default: () => <div data-testid="location-preview" />
}));

function existingEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "evt-1",
    trip_id: "trip-1",
    title: "Dinner at Da Enzo",
    type: "activity",
    start_at: "2026-08-05T19:00:00Z",
    end_at: "2026-08-05T21:30:00Z",
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: false,
    ...overrides
  };
}

function resetMocks() {
  insertSingle.mockReset();
  insertSingle.mockResolvedValue({ data: { id: "evt-1" }, error: null });
  updateSingle.mockReset();
  updateSingle.mockResolvedValue({ data: { id: "evt-1" }, error: null });
  insert.mockClear();
  update.mockClear();
  searchPlaces.mockReset();
  searchPlaces.mockResolvedValue([]);
  reverseGeocode.mockReset();
  reverseGeocode.mockResolvedValue(null);
}

afterAll(restoreTimeZone);

describe.each(TRAVEL_ZONES)("EventModal on a device in %s", (tz) => {
  beforeEach(() => {
    setTimeZone(tz);
    resetMocks();
  });

  it("stores a typed start time exactly as typed", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Dinner");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-05T19:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: "2026-08-05T19:00:00Z", end_at: null })
    );
  });

  it("stores a start and end pair exactly as typed", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Dinner");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-05T19:00" } });
    fireEvent.change(screen.getByPlaceholderText("End (optional)"), { target: { value: "2026-08-05T21:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: "2026-08-05T19:00:00Z", end_at: "2026-08-05T21:30:00Z" })
    );
  });

  it("keeps a midnight start on its own date", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Midnight mass");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-05T00:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_at: "2026-08-05T00:00:00Z" }));
  });

  it("keeps a 23:59 start on its own date", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Last call");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-05T23:59" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_at: "2026-08-05T23:59:00Z" }));
  });

  it("stores a time that falls in a DST gap without nudging it forward", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Early flight");
    // 03:30 on 29 Mar 2026 does not exist in Europe/Helsinki; 02:30 on
    // 8 Mar 2026 does not exist in America/New_York.
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-03-29T03:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_at: "2026-03-29T03:30:00Z" }));
  });

  it("stores an all-day date without shifting it", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Street festival");
    await userEvent.click(screen.getByRole("checkbox", { name: "All day" }));
    fireEvent.change(screen.getByPlaceholderText("Date"), { target: { value: "2026-08-05" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ all_day: true, start_at: "2026-08-05T00:00:00Z" })
    );
  });

  it("stores a stay's check-in and check-out dates without shifting them", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Hotel Roma");
    fireEvent.change(screen.getByPlaceholderText("Check-in"), { target: { value: "2026-08-03" } });
    fireEvent.change(screen.getByPlaceholderText("Check-out"), { target: { value: "2026-08-08" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: "2026-08-03T00:00:00Z", end_at: "2026-08-08T00:00:00Z" })
    );
  });

  it("reopens an existing event showing the time it was saved with", () => {
    render(<EventModal tripId="trip-1" event={existingEvent()} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect((screen.getByPlaceholderText("Start") as HTMLInputElement).value).toBe("2026-08-05T19:00");
    expect((screen.getByPlaceholderText("End (optional)") as HTMLInputElement).value).toBe("2026-08-05T21:30");
  });

  it("reopens a legacy row (stored with a +00:00 offset) at the same clock reading", () => {
    render(
      <EventModal
        tripId="trip-1"
        event={existingEvent({ start_at: "2026-08-05T19:00:00+00:00", end_at: "2026-08-05T21:30:00+00:00" })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect((screen.getByPlaceholderText("Start") as HTMLInputElement).value).toBe("2026-08-05T19:00");
  });

  it("reopens a stay on its stored check-in and check-out dates", () => {
    render(
      <EventModal
        tripId="trip-1"
        event={existingEvent({
          type: "accommodation",
          all_day: true,
          start_at: "2026-08-03T00:00:00Z",
          end_at: "2026-08-08T00:00:00Z"
        })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect((screen.getByPlaceholderText("Check-in") as HTMLInputElement).value).toBe("2026-08-03");
    expect((screen.getByPlaceholderText("Check-out") as HTMLInputElement).value).toBe("2026-08-08");
  });

  it("does not drift the time when an untouched event is saved again", async () => {
    // Open an event abroad, change only the title, save. The stored times must
    // come back out byte-identical — this is where a round trip through the
    // device's zone would quietly rewrite the whole trip.
    render(<EventModal tripId="trip-1" event={existingEvent()} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), " (booked)");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateSingle).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Dinner at Da Enzo (booked)",
        start_at: "2026-08-05T19:00:00Z",
        end_at: "2026-08-05T21:30:00Z"
      })
    );
  });

  it("does not drift an all-day event's dates when it is saved again", async () => {
    render(
      <EventModal
        tripId="trip-1"
        event={existingEvent({
          type: "accommodation",
          all_day: true,
          title: "Hotel Roma",
          start_at: "2026-08-03T00:00:00Z",
          end_at: "2026-08-08T00:00:00Z"
        })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateSingle).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: "2026-08-03T00:00:00Z", end_at: "2026-08-08T00:00:00Z" })
    );
  });

  it("prefills the end time an hour after the start, on the clock", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-03-29T03:00" } });
    const endInput = screen.getByPlaceholderText("End (optional)");
    fireEvent.mouseDown(endInput);

    expect((endInput as HTMLInputElement).value).toBe("2026-03-29T04:00");
  });

  it("prefills the check-out date one day after check-in", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    fireEvent.change(screen.getByPlaceholderText("Check-in"), { target: { value: "2026-10-24" } });
    const checkOut = screen.getByPlaceholderText("Check-out");
    fireEvent.mouseDown(checkOut);

    expect((checkOut as HTMLInputElement).value).toBe("2026-10-25");
  });

  it("validates an event against the trip's dates by calendar day, not by instant", async () => {
    // 23:30 on the trip's last day is inside the trip. Resolved as an instant
    // in a zone ahead of UTC it would look like the day after, and the
    // composer would refuse to save a perfectly valid event.
    render(
      <EventModal
        tripId="trip-1"
        event={null}
        tripStart="2026-08-03"
        tripEnd="2026-08-09"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await userEvent.type(screen.getByPlaceholderText("Title"), "Night train");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-09T23:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(screen.queryByText(/must be within the trip/i)).not.toBeInTheDocument();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_at: "2026-08-09T23:30:00Z" }));
  });

  it("still rejects an event that really is outside the trip", async () => {
    render(
      <EventModal
        tripId="trip-1"
        event={null}
        tripStart="2026-08-03"
        tripEnd="2026-08-09"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await userEvent.type(screen.getByPlaceholderText("Title"), "Too late");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-10T00:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/must be within the trip/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });
});

describe("an event created at home and edited abroad", () => {
  beforeEach(resetMocks);

  it("keeps the same time through every leg of the journey", async () => {
    // Create it in Helsinki.
    setTimeZone("Europe/Helsinki");
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Title"), "Dinner");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-08-05T19:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    let stored = insert.mock.calls[0][0] as unknown as TripEvent;
    cleanup();

    // Then reopen and re-save it in each zone in turn, as if flying on.
    for (const tz of TRAVEL_ZONES) {
      setTimeZone(tz);
      update.mockClear();
      render(
        <EventModal
          tripId="trip-1"
          event={{ ...existingEvent(), ...stored, end_at: stored.end_at ?? null }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );
      expect((screen.getByPlaceholderText("Start") as HTMLInputElement).value, `shown in ${tz}`).toBe(
        "2026-08-05T19:00"
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateSingle).toHaveBeenCalled());
      stored = update.mock.calls[0][0] as unknown as TripEvent;
      expect(stored.start_at, `re-saved in ${tz}`).toBe("2026-08-05T19:00:00Z");
      cleanup();
    }
  });
});

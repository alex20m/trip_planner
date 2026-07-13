import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventModal from "@/components/EventModal";

const insertSingle = vi.fn();
const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ insert })
  })
}));

const searchPlaces = vi.hoisted(() => vi.fn());
vi.mock("@/lib/geocode", () => ({ searchPlaces }));

describe("EventModal", () => {
  beforeEach(() => {
    insertSingle.mockReset();
    insert.mockClear();
    searchPlaces.mockReset();
    searchPlaces.mockResolvedValue([]);
  });

  it("requires a check-out date for a Stay event", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Hotel Rome");
    const checkInInput = screen.getByPlaceholderText("Check-in");
    fireEvent.change(checkInInput, { target: { value: "2026-07-10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/check-out date/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("rejects a check-out date on or before check-in", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Hotel Rome");
    const checkInInput = screen.getByPlaceholderText("Check-in");
    const checkOutInput = screen.getByPlaceholderText("Check-out");
    fireEvent.change(checkInInput, { target: { value: "2026-07-10" } });
    fireEvent.change(checkOutInput, { target: { value: "2026-07-10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/after check-in/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("saves a Stay event once both dates are set", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "accommodation", start_at: "2026-07-10T00:00:00Z", end_at: "2026-07-12T00:00:00Z" },
      error: null
    });
    const onSaved = vi.fn();
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Hotel Rome");
    const checkInInput = screen.getByPlaceholderText("Check-in");
    const checkOutInput = screen.getByPlaceholderText("Check-out");
    fireEvent.change(checkInInput, { target: { value: "2026-07-10" } });
    fireEvent.change(checkOutInput, { target: { value: "2026-07-12" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(insertSingle).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("saves the notes entered for an event", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "activity", start_at: "2026-07-10T00:00:00Z", end_at: null },
      error: null
    });
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    const startInput = screen.getByPlaceholderText("Start");
    fireEvent.change(startInput, { target: { value: "2026-07-10T10:00" } });
    await userEvent.type(screen.getByPlaceholderText("Notes (optional)"), "Bring tickets");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ description: "Bring tickets" }));
  });

  it("rejects a location typed by hand that wasn't picked from the suggestions", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });
    fireEvent.change(screen.getByPlaceholderText("Location (optional)"), { target: { value: "made-up place" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/choose a location from the suggestions/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("saves the place name and coordinates of a picked suggestion", async () => {
    searchPlaces.mockResolvedValue([{ name: "Colosseum, Rome, Italy", lat: 41.8902, lng: 12.4922 }]);
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "activity", start_at: "2026-07-10T00:00:00Z", end_at: null },
      error: null
    });
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });
    fireEvent.change(screen.getByPlaceholderText("Location (optional)"), { target: { value: "colos" } });
    fireEvent.mouseDown(await screen.findByText("Colosseum, Rome, Italy", undefined, { timeout: 2000 }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "Colosseum, Rome, Italy",
        location_lat: 41.8902,
        location_lng: 12.4922
      })
    );
  });

  it("searches city-level locations for an Activity, like Travel does", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Location (optional)"), { target: { value: "rome" } });

    await waitFor(
      () => expect(searchPlaces).toHaveBeenCalledWith("rome", expect.anything(), { cityLevel: true }),
      { timeout: 2000 }
    );
  });

  it("searches city-level locations for a Stay, like Travel does", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    fireEvent.change(screen.getByPlaceholderText("Location (optional)"), { target: { value: "oulu" } });

    await waitFor(
      () => expect(searchPlaces).toHaveBeenCalledWith("oulu", expect.anything(), { cityLevel: true }),
      { timeout: 2000 }
    );
  });

  it("requires both a start and an end destination for a Travel event (issue #69)", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Travel" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Train to Oulu");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/both a start and an end destination/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("still rejects a Travel event that only has a start destination", async () => {
    searchPlaces.mockResolvedValue([{ name: "Helsinki, Finland", lat: 60.17, lng: 24.94 }]);
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Travel" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Train to Oulu");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });
    fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "hels" } });
    fireEvent.mouseDown(await screen.findByText("Helsinki, Finland", undefined, { timeout: 2000 }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/both a start and an end destination/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("saves both travel destinations with their coordinates (issue #69)", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "travel", start_at: "2026-07-10T10:00:00Z", end_at: null },
      error: null
    });
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Travel" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Train to Oulu");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });

    searchPlaces.mockResolvedValue([{ name: "Helsinki, Finland", lat: 60.17, lng: 24.94 }]);
    fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "hels" } });
    fireEvent.mouseDown(await screen.findByText("Helsinki, Finland", undefined, { timeout: 2000 }));

    searchPlaces.mockResolvedValue([{ name: "Oulu, Finland", lat: 65.01, lng: 25.47 }]);
    fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "oulu" } });
    fireEvent.mouseDown(await screen.findByText("Oulu, Finland", undefined, { timeout: 2000 }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "Helsinki, Finland",
        location_lat: 60.17,
        location_lng: 24.94,
        end_location: "Oulu, Finland",
        end_location_lat: 65.01,
        end_location_lng: 25.47
      })
    );
  });

  it("saves non-travel events without an end destination", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "activity", start_at: "2026-07-10T00:00:00Z", end_at: null },
      error: null
    });
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.queryByPlaceholderText("To")).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2026-07-10T10:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ end_location: null, end_location_lat: null, end_location_lng: null })
    );
  });

  it("switches to a date-only field and saves all_day when the All day box is checked", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "evt-1", type: "activity", start_at: "2026-07-10T00:00:00Z", end_at: null, all_day: true },
      error: null
    });
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    await userEvent.click(screen.getByRole("checkbox", { name: "All day" }));
    expect(screen.queryByPlaceholderText("Start")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Date"), { target: { value: "2026-07-10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(insertSingle).toHaveBeenCalled());
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ all_day: true, start_at: "2026-07-10T00:00:00.000Z" })
    );
  });

  it("rejects an all-day end date on or before the start date", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    await userEvent.click(screen.getByRole("checkbox", { name: "All day" }));
    fireEvent.change(screen.getByPlaceholderText("Date"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByPlaceholderText("End date (optional)"), { target: { value: "2026-07-10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("does not show the All day checkbox for a Stay, since it is already date-only", async () => {
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("checkbox", { name: "All day" })).not.toBeInTheDocument();
  });

  it("prefills the start fields from defaultStart when creating a new event", async () => {
    render(<EventModal tripId="trip-1" event={null} defaultStart="2026-08-06T14:00" onClose={vi.fn()} onSaved={vi.fn()} />);

    // Timed view starts on the pressed day at the pressed hour…
    expect((screen.getByPlaceholderText("Start") as HTMLInputElement).value).toBe("2026-08-06T14:00");

    // …and the date carries over to the all-day and Stay date fields too.
    await userEvent.click(screen.getByRole("checkbox", { name: "All day" }));
    expect((screen.getByPlaceholderText("Date") as HTMLInputElement).value).toBe("2026-08-06");
    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect((screen.getByPlaceholderText("Check-in") as HTMLInputElement).value).toBe("2026-08-06");
  });

  it("ignores defaultStart when editing an existing event", () => {
    render(
      <EventModal
        tripId="trip-1"
        event={
          {
            id: "evt-1",
            trip_id: "trip-1",
            title: "Museum",
            type: "activity",
            start_at: "2026-08-10T10:00:00Z",
            end_at: null,
            location: null,
            location_lat: null,
            location_lng: null,
            end_location: null,
            end_location_lat: null,
            end_location_lng: null,
            description: null,
            all_day: false
          } as never
        }
        defaultStart="2026-08-06T14:00"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const value = (screen.getByPlaceholderText("Start") as HTMLInputElement).value;
    expect(value.startsWith("2026-08-10T")).toBe(true);
  });

  it("hides the Cancel button and shows a saving state while saving", async () => {
    let resolveInsert!: (v: unknown) => void;
    insertSingle.mockReturnValue(new Promise((resolve) => (resolveInsert = resolve)));
    const onSaved = vi.fn();
    render(<EventModal tripId="trip-1" event={null} onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    const startInput = screen.getByPlaceholderText("Start");
    fireEvent.change(startInput, { target: { value: "2026-07-10T10:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: /saving/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    resolveInsert({ data: { id: "evt-1", type: "activity", start_at: "2026-07-10T00:00:00Z", end_at: null }, error: null });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

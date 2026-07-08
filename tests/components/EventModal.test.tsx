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

describe("EventModal", () => {
  beforeEach(() => {
    insertSingle.mockReset();
    insert.mockClear();
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

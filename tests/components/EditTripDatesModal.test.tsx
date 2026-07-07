import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditTripDatesModal from "@/components/EditTripDatesModal";
import type { Trip } from "@/lib/types";

const updateSingle = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: updateSingle
          })
        })
      })
    })
  })
}));

const trip: Trip = {
  id: "trip-1",
  name: "Rome 2026",
  owner_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  start_date: "2026-08-01",
  end_date: "2026-08-07"
};

describe("EditTripDatesModal", () => {
  beforeEach(() => {
    updateSingle.mockReset();
  });

  it("saves updated dates and reports the new trip back", async () => {
    const updated = { ...trip, start_date: "2026-08-02", end_date: "2026-08-09" };
    updateSingle.mockResolvedValue({ data: updated, error: null });
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<EditTripDatesModal trip={trip} onClose={onClose} onSaved={onSaved} />);
    await userEvent.clear(screen.getByLabelText("Start"));
    await userEvent.type(screen.getByLabelText("Start"), "2026-08-02");
    await userEvent.clear(screen.getByLabelText("End"));
    await userEvent.type(screen.getByLabelText("End"), "2026-08-09");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateSingle).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalled();
  });

  it("stacks the date fields on narrow screens so they cannot overlap", () => {
    render(<EditTripDatesModal trip={trip} onClose={vi.fn()} onSaved={vi.fn()} />);

    const grid = screen.getByLabelText("Start").closest("div");
    expect(grid).toHaveClass("grid-cols-1", "sm:grid-cols-2");
  });

  it("rejects an end date before the start date without saving", async () => {
    const onSaved = vi.fn();

    render(<EditTripDatesModal trip={trip} onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.clear(screen.getByLabelText("End"));
    await userEvent.type(screen.getByLabelText("End"), "2026-07-01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateSingle).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument();
  });
});

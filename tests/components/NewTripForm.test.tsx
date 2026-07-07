import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import NewTripForm from "@/components/NewTripForm";

const insertSingle = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: insertSingle
        })
      })
    })
  })
}));

let online = true;
vi.mock("@/hooks/useOnline", () => ({
  useOnline: () => online
}));

describe("NewTripForm", () => {
  beforeEach(() => {
    online = true;
    insertSingle.mockReset();
    getUser.mockClear();
  });

  it("creates a trip with default start/end dates and navigates to it", async () => {
    insertSingle.mockResolvedValue({ data: { id: "trip-123" }, error: null });
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: "New trip" }));
    await userEvent.type(screen.getByPlaceholderText(/trip name/i), "Rome 2026");
    await userEvent.click(screen.getByRole("button", { name: "Create trip" }));

    expect(insertSingle).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/trips/trip-123");
  });

  it("rejects an end date before the start date", async () => {
    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: "New trip" }));
    await userEvent.type(screen.getByPlaceholderText(/trip name/i), "Rome 2026");
    await userEvent.clear(screen.getByLabelText("Start"));
    await userEvent.type(screen.getByLabelText("Start"), "2026-08-10");
    await userEvent.clear(screen.getByLabelText("End"));
    await userEvent.type(screen.getByLabelText("End"), "2026-08-01");
    await userEvent.click(screen.getByRole("button", { name: "Create trip" }));

    expect(insertSingle).not.toHaveBeenCalled();
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument();
  });

  it("stacks the date fields on narrow screens so they cannot overlap", async () => {
    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: "New trip" }));

    const grid = screen.getByLabelText("Start").closest("div");
    expect(grid).toHaveClass("grid-cols-1", "sm:grid-cols-2");
  });

  it("does not create a trip for a blank name", async () => {
    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: "New trip" }));
    expect(screen.getByRole("button", { name: "Create trip" })).toBeDisabled();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("disables the New trip button while offline", () => {
    online = false;
    render(<NewTripForm />);
    expect(screen.getByRole("button", { name: "New trip" })).toBeDisabled();
    expect(screen.getByText(/requires an internet connection/i)).toBeInTheDocument();
  });
});

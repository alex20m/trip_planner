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

  it("creates a trip and navigates to it", async () => {
    insertSingle.mockResolvedValue({ data: { id: "trip-123" }, error: null });
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<NewTripForm />);
    await userEvent.type(screen.getByPlaceholderText(/new trip/i), "Rome 2026");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(insertSingle).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/trips/trip-123");
  });

  it("does not create a trip for a blank name", async () => {
    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("disables the input and button while offline", () => {
    online = false;
    render(<NewTripForm />);
    expect(screen.getByPlaceholderText(/new trip/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(screen.getByText(/requires an internet connection/i)).toBeInTheDocument();
  });
});

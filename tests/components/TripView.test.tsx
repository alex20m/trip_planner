import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import TripView from "@/components/TripView";
import type { Trip } from "@/lib/types";

const deleteEq = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({
        eq: (...args: unknown[]) => deleteEq(...args)
      })
    })
  })
}));

const idbGet = vi.fn().mockResolvedValue(undefined);
const idbSet = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/offlineStore", () => ({
  idbGet: (...args: unknown[]) => idbGet(...args),
  idbSet: (...args: unknown[]) => idbSet(...args),
  tripSnapshotKey: (id: string) => `trip-${id}`
}));

let online = true;
vi.mock("@/hooks/useOnline", () => ({
  useOnline: () => online
}));

const trip: Trip = {
  id: "trip-1",
  name: "Rome 2026",
  owner_id: "user-1",
  created_at: "2026-01-01",
  start_date: "2026-08-01",
  end_date: "2026-08-07"
};

describe("TripView — deleting a trip", () => {
  beforeEach(() => {
    online = true;
    deleteEq.mockReset();
    deleteEq.mockResolvedValue({ error: null });
    idbGet.mockResolvedValue(undefined);
    idbSet.mockResolvedValue(undefined);
    window.sessionStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a Delete trip button to the owner and removes the trip on confirm", async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete trip" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith("id", "trip-1");
    expect(push).toHaveBeenCalledWith("/");
  });

  it("navigates home optimistically before the network delete resolves", async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() } as any);

    // A delete that never resolves during this test.
    deleteEq.mockReturnValue(new Promise(() => {}));

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete trip" }));

    // Even though the delete is still pending, we've already navigated and
    // recorded the optimistic deletion.
    expect(push).toHaveBeenCalledWith("/");
    expect(JSON.parse(window.sessionStorage.getItem("optimistically-deleted-trips")!)).toContain("trip-1");
  });

  it("does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete trip" }));

    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("does not show trip options to editors or viewers", () => {
    render(<TripView trip={trip} role="edit" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByRole("button", { name: "More trip options" })).not.toBeInTheDocument();

    render(<TripView trip={trip} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByRole("button", { name: "More trip options" })).not.toBeInTheDocument();
  });
});

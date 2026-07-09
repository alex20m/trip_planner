import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
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
const setLastSynced = vi.fn((ts?: number) => Promise.resolve(ts ?? Date.now()));
const getLastSynced = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/offlineStore", () => ({
  idbGet: (...args: unknown[]) => idbGet(...args),
  idbSet: (...args: unknown[]) => idbSet(...args),
  setLastSynced: (ts?: number) => setLastSynced(ts),
  getLastSynced: () => getLastSynced(),
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

describe("TripView — offline snapshots", () => {
  beforeEach(() => {
    online = true;
    idbGet.mockReset();
    idbGet.mockResolvedValue(undefined);
    idbSet.mockClear();
    setLastSynced.mockClear();
    getLastSynced.mockReset();
    getLastSynced.mockResolvedValue(null);
  });

  afterEach(() => {
    // Restore jsdom's default navigator.onLine (true).
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  });

  it("saves a snapshot to IndexedDB while online", async () => {
    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await waitFor(() =>
      expect(idbSet).toHaveBeenCalledWith(
        "trip-trip-1",
        expect.objectContaining({ trip: { id: "trip-1", name: "Rome 2026" }, savedAt: expect.any(Number) })
      )
    );
  });

  it("does not overwrite the snapshot when the device is offline but the online state is still the stale initial true", async () => {
    // Reproduces opening a cached page in flight mode: useOnline still reports
    // its initial `true` during the first effect pass, while navigator.onLine
    // is already false. Writing here would clobber the last good snapshot with
    // stale server-rendered props and a fresh timestamp.
    online = true;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await waitFor(() => expect(idbGet).not.toHaveBeenCalled());
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("loads the last snapshot from IndexedDB when offline", async () => {
    online = false;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    idbGet.mockResolvedValue({
      trip: { id: "trip-1", name: "Rome 2026" },
      role: "owner",
      events: [],
      sections: [
        {
          id: "s1",
          trip_id: "trip-1",
          title: "Packing list",
          sort_order: 0,
          notes: [{ id: "n1", section_id: "s1", content: "Passport", done: false, sort_order: 0 }]
        }
      ],
      savedAt: 1700000000000
    });

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("tab", { name: /notes/i }));
    expect(await screen.findByText("Passport")).toBeInTheDocument();
    expect(idbSet).not.toHaveBeenCalled();
  });

  it("sources the offline banner time from the shared last-synced value, not the snapshot's own savedAt", async () => {
    online = false;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    idbGet.mockResolvedValue({
      trip: { id: "trip-1", name: "Rome 2026" },
      role: "owner",
      events: [],
      sections: [],
      savedAt: 1700000000000
    });
    getLastSynced.mockResolvedValue(1_700_000_100_000);

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await waitFor(() => expect(getLastSynced).toHaveBeenCalled());
    const label = format(new Date(1_700_000_100_000), "d MMM, HH:mm", { locale: enUS });
    expect(await screen.findByText(new RegExp(`showing last saved data \\(${label}\\)`))).toBeInTheDocument();
  });
});

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

  it("does not offer Delete trip to editors or viewers, but lets them sync the calendar", async () => {
    const syncable = { ...trip, calendar_token: "tok-1" };
    for (const role of ["edit", "read"] as const) {
      const { unmount } = render(
        <TripView trip={syncable} role={role} initialEvents={[]} initialSections={[]} />
      );

      await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
      expect(screen.getByRole("menuitem", { name: "Sync calendar" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Delete trip" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("lets editors open the trip-dates editor but not viewers", () => {
    const { unmount } = render(<TripView trip={trip} role="edit" initialEvents={[]} initialSections={[]} />);
    expect(screen.getByTitle("Edit trip dates")).toBeInTheDocument();
    unmount();

    render(<TripView trip={trip} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByTitle("Edit trip dates")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import { useRouter } from "next/navigation";
import TripView from "@/components/TripView";
import type { Trip } from "@/lib/types";

const deleteEq = vi.fn();
const insertSingle = vi.fn();

// Per-table rows returned by the refresh select chain. Tests mutate this to
// control what a refresh pulls from the server.
const refreshData: Record<string, unknown> = {
  trips: null,
  trip_events: [],
  note_sections: []
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: (...args: unknown[]) => deleteEq(...args)
      }),
      // Supports both `.eq().single()` (trips) and `.eq().order()` (events,
      // sections) refresh queries against the same per-table row set.
      select: () => {
        const chain: any = {
          eq: () => chain,
          order: () => Promise.resolve({ data: refreshData[table] }),
          single: () => Promise.resolve({ data: refreshData[table] })
        };
        return chain;
      },
      insert: () => ({ select: () => ({ single: insertSingle }) })
    })
  })
}));

// The geocoder isn't exercised here, but EventModal imports it.
vi.mock("@/lib/geocode", () => ({ searchPlaces: vi.fn().mockResolvedValue([]) }));

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

// A trip that has not started yet, so the calendar reliably opens on the
// trip's own first week. (A trip covering the day the suite happens to run on
// opens on that week instead — see "the week the calendar opens on" below.)
const trip: Trip = {
  id: "trip-1",
  name: "Rome 2030",
  owner_id: "user-1",
  created_at: "2030-01-01",
  start_date: "2030-08-01",
  end_date: "2030-08-07"
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
        expect.objectContaining({ trip: { id: "trip-1", name: "Rome 2030" }, savedAt: expect.any(Number) })
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
      trip: { id: "trip-1", name: "Rome 2030" },
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
      trip: { id: "trip-1", name: "Rome 2030" },
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

  it("opens the new-event composer prefilled with the pressed calendar day", async () => {
    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    // First visible week of the 1–7 Aug trip shows Thu 1 Aug through Sun 4 Aug.
    await userEvent.click(screen.getAllByLabelText("Add event on 1 Aug")[0]);

    expect(screen.getByText("New event")).toBeInTheDocument();
    // Day presses without a specific hour default to midday.
    expect((screen.getByPlaceholderText("Start") as HTMLInputElement).value).toBe("2030-08-01T12:00");
  });

  it("offers no day press targets to viewers or while offline", () => {
    const { unmount } = render(<TripView trip={trip} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByLabelText(/add event on/i)).not.toBeInTheDocument();
    unmount();

    online = false;
    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByLabelText(/add event on/i)).not.toBeInTheDocument();
  });

  it("lets editors open the trip-dates editor but not viewers", () => {
    const { unmount } = render(<TripView trip={trip} role="edit" initialEvents={[]} initialSections={[]} />);
    expect(screen.getByTitle("Edit trip dates")).toBeInTheDocument();
    unmount();

    render(<TripView trip={trip} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.queryByTitle("Edit trip dates")).not.toBeInTheDocument();
  });
});

describe("TripView — refreshing for the latest changes", () => {
  beforeEach(() => {
    online = true;
    idbGet.mockResolvedValue(undefined);
    idbSet.mockResolvedValue(undefined);
    refreshData.trips = null;
    refreshData.trip_events = [];
    refreshData.note_sections = [];
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn()
    } as any);
  });

  it("offers a Refresh item in the menu to every role", async () => {
    for (const role of ["owner", "edit", "read"] as const) {
      const { unmount } = render(<TripView trip={trip} role={role} initialEvents={[]} initialSections={[]} />);
      await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
      expect(screen.getByRole("menuitem", { name: "Refresh" })).toBeInTheDocument();
      unmount();
    }
  });

  it("pulls the latest events from the server and shows them", async () => {
    refreshData.trip_events = [
      {
        id: "e1",
        trip_id: "trip-1",
        title: "Colosseum tour",
        type: "activity",
        start_at: "2030-08-01T10:00:00Z",
        end_at: "2030-08-01T11:00:00Z",
        location: null,
        location_lat: null,
        location_lng: null,
        description: null,
        all_day: false
      }
    ];

    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    // Not on screen until we refresh.
    expect(screen.queryByText("Colosseum tour")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Refresh" }));

    expect((await screen.findAllByText("Colosseum tour")).length).toBeGreaterThan(0);
  });

  it("disables the Refresh item while offline", async () => {
    online = false;
    render(<TripView trip={trip} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "More trip options" }));
    expect(screen.getByRole("menuitem", { name: "Refresh" })).toBeDisabled();
  });
});

describe("TripView — saving an event", () => {
  beforeEach(() => {
    online = true;
    insertSingle.mockReset();
    idbGet.mockResolvedValue(undefined);
    idbSet.mockResolvedValue(undefined);
    refreshData.trips = null;
    refreshData.trip_events = [];
    refreshData.note_sections = [];
  });

  // Regression: an editor's insert can succeed while Supabase returns no row
  // ({ data: null }). TripView used to read `.id` off that null and throw a
  // TypeError that blanked the whole page. It must instead refetch from the
  // server, which brings the just-saved event into view.
  it("refetches from the server (no crash) when a saved event comes back empty", async () => {
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn()
    } as any);
    insertSingle.mockResolvedValue({ data: null, error: null });

    const existing = {
      id: "evt-existing",
      trip_id: "trip-1",
      title: "Colosseum",
      type: "activity",
      all_day: false,
      start_at: "2030-08-02T09:00:00Z",
      end_at: null,
      location: null,
      location_lat: null,
      location_lng: null,
      description: null
    } as any;
    // What the server returns on the post-save refetch: the existing event plus
    // the freshly-saved one whose row the insert didn't echo back.
    refreshData.trip_events = [
      existing,
      { ...existing, id: "evt-new", title: "Museum", start_at: "2030-08-02T10:00:00Z" }
    ];

    render(<TripView trip={trip} role="edit" initialEvents={[existing]} initialSections={[]} />);
    expect(screen.queryAllByText("Museum")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Add event" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Museum");
    fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "2030-08-02T10:00" } });
    await userEvent.type(screen.getByPlaceholderText("Notes (optional)"), "Bring tickets");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // No crash: the refetch runs and the just-saved event shows up, with the
    // pre-existing one still there.
    expect((await screen.findAllByText("Museum")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Colosseum").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Once you are on the trip, the useful week is the one you are living, not the
// one the trip began in. Dates here are relative to the day the suite runs, so
// "under way" really means under way whenever that is.
// ---------------------------------------------------------------------------
describe("TripView — the week the calendar opens on", () => {
  beforeEach(() => {
    online = true;
    idbGet.mockResolvedValue(undefined);
    idbSet.mockResolvedValue(undefined);
  });

  const dayKey = (offsetDays: number) => format(addDays(new Date(), offsetDays), "yyyy-MM-dd");
  const weekLabelFor = (d: Date) => {
    const monday = startOfWeek(d, { weekStartsOn: 1 });
    return `${format(monday, "d MMM", { locale: enUS })} – ${format(addDays(monday, 6), "d MMM yyyy", { locale: enUS })}`;
  };
  const tripOver = (from: number, to: number): Trip => ({
    ...trip,
    start_date: dayKey(from),
    end_date: dayKey(to)
  });

  it("opens on the current week when the trip has already started", () => {
    render(<TripView trip={tripOver(-10, 10)} role="owner" initialEvents={[]} initialSections={[]} />);

    expect(screen.getByText(weekLabelFor(new Date()))).toBeInTheDocument();
    // Today itself is on screen, so the traveller lands on their own day.
    expect(screen.getAllByLabelText(`Add event on ${format(new Date(), "d MMM", { locale: enUS })}`).length)
      .toBeGreaterThan(0);
  });

  // Spans of nine days, not seven: a trip whose range happens to read exactly
  // like the week label would collide with the trip-dates chip in the header.
  it("counts the trip's first and last day as under way", () => {
    const { unmount } = render(<TripView trip={tripOver(0, 8)} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.getByText(weekLabelFor(new Date()))).toBeInTheDocument();
    unmount();

    render(<TripView trip={tripOver(-8, 0)} role="read" initialEvents={[]} initialSections={[]} />);
    expect(screen.getByText(weekLabelFor(new Date()))).toBeInTheDocument();
  });

  it("opens on the trip's first week when the trip has not started yet", () => {
    render(<TripView trip={tripOver(3, 17)} role="owner" initialEvents={[]} initialSections={[]} />);

    expect(screen.getByText(weekLabelFor(addDays(new Date(), 3)))).toBeInTheDocument();
  });

  it("opens on the trip's first week again once the trip is over", () => {
    render(<TripView trip={tripOver(-30, -20)} role="owner" initialEvents={[]} initialSections={[]} />);

    expect(screen.getByText(weekLabelFor(addDays(new Date(), -30)))).toBeInTheDocument();
  });

  // Regression: going into a trip, back out to the list and in again is how a
  // trip is normally opened, and every one of those visits has to land on the
  // current week — not just the first one.
  it("opens on the current week again every time the trip is reopened", () => {
    const underway = tripOver(-10, 10);

    for (const visit of [1, 2, 3]) {
      const { unmount } = render(
        <TripView trip={underway} role="owner" initialEvents={[]} initialSections={[]} />
      );

      expect(screen.getByText(weekLabelFor(new Date())), `visit ${visit}`).toBeInTheDocument();
      // …and on the day itself, not just the week it belongs to.
      expect(
        screen.getAllByLabelText(`Add event on ${format(new Date(), "d MMM", { locale: enUS })}`).length,
        `visit ${visit}`
      ).toBeGreaterThan(0);
      unmount();
    }
  });

  // Paging away and back is the one case where the reader's own position wins:
  // the calendar must not drag them back to today behind their back.
  it("leaves the reader on the week they paged to", async () => {
    render(<TripView trip={tripOver(-10, 10)} role="owner" initialEvents={[]} initialSections={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(screen.getByText(weekLabelFor(addDays(new Date(), 7)))).toBeInTheDocument();
    expect(screen.queryByText(weekLabelFor(new Date()))).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Landing on today belongs to opening the trip, not to the Calendar tab. The
// tabs unmount and remount the calendar, so a look at the notes and back must
// not drag the reader away from wherever they had got to.
// ---------------------------------------------------------------------------
describe("TripView — coming back to the calendar tab", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    online = true;
    idbGet.mockResolvedValue(undefined);
    idbSet.mockResolvedValue(undefined);
    scrollIntoView.mockClear();
    // jsdom has no layout, so it does not implement scrollIntoView at all.
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  // Today's position is re-asserted on the frame after mount, so let that run
  // before counting anything.
  const flushFrame = () => act(async () => void (await new Promise((r) => setTimeout(r, 32))));

  const dayKey = (offsetDays: number) => format(addDays(new Date(), offsetDays), "yyyy-MM-dd");
  const underway: Trip = { ...trip, start_date: dayKey(-10), end_date: dayKey(10) };
  const weekLabelFor = (d: Date) => {
    const monday = startOfWeek(d, { weekStartsOn: 1 });
    return `${format(monday, "d MMM", { locale: enUS })} – ${format(addDays(monday, 6), "d MMM yyyy", { locale: enUS })}`;
  };

  const openTrip = async () => {
    render(<TripView trip={underway} role="owner" initialEvents={[]} initialSections={[]} />);
    await flushFrame();
    // Opening the trip is the moment that does land on today.
    expect(scrollIntoView).toHaveBeenCalled();
    scrollIntoView.mockClear();
  };

  it("does not scroll back to today when the reader returns from the notes tab", async () => {
    await openTrip();

    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    await userEvent.click(screen.getByRole("tab", { name: "Calendar" }));
    await flushFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll back to today however many times the tabs are used", async () => {
    await openTrip();

    for (const round of [1, 2, 3]) {
      await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
      await userEvent.click(screen.getByRole("tab", { name: "Calendar" }));
      await flushFrame();

      expect(scrollIntoView, `round ${round}`).not.toHaveBeenCalled();
    }
  });

  // The other half of staying put: the week on screen is the reader's too, so
  // returning to the tab must not reset it to the current week either.
  it("keeps the week the reader paged to across a trip to the notes tab", async () => {
    await openTrip();

    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    await userEvent.click(screen.getByRole("tab", { name: "Calendar" }));

    expect(screen.getByText(weekLabelFor(addDays(new Date(), 7)))).toBeInTheDocument();
    expect(screen.queryByText(weekLabelFor(new Date()))).not.toBeInTheDocument();
  });
});

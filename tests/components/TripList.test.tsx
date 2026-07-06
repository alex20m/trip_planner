import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TripList from "@/components/TripList";

const idbSet = vi.fn().mockResolvedValue(undefined);
const idbGet = vi.fn();
const prefetchAllTrips = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/offlineStore", () => ({
  idbSet: (...args: unknown[]) => idbSet(...args),
  idbGet: (...args: unknown[]) => idbGet(...args),
  prefetchAllTrips: (...args: unknown[]) => prefetchAllTrips(...args)
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({})
}));

let online = true;
vi.mock("@/hooks/useOnline", () => ({
  useOnline: () => online
}));

describe("TripList", () => {
  beforeEach(() => {
    online = true;
    idbSet.mockClear();
    idbGet.mockReset();
    prefetchAllTrips.mockClear();
  });

  it("renders each trip as a link to its trip page", () => {
    render(
      <TripList
        initialTrips={[
          { id: "1", name: "Rome", created_at: "2026-01-01" },
          { id: "2", name: "Paris", created_at: "2026-02-01" }
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "Rome" })).toHaveAttribute("href", "/trips/1");
    expect(screen.getByRole("link", { name: "Paris" })).toHaveAttribute("href", "/trips/2");
  });

  it("shows an empty state when there are no trips", () => {
    render(<TripList initialTrips={[]} />);
    expect(screen.getByText(/no trips yet/i)).toBeInTheDocument();
  });

  it("caches trips for offline use when online", () => {
    render(<TripList initialTrips={[{ id: "1", name: "Rome", created_at: "2026-01-01" }]} />);
    expect(idbSet).toHaveBeenCalledWith("trips-list", expect.objectContaining({ trips: expect.any(Array) }));
    expect(prefetchAllTrips).toHaveBeenCalled();
  });

  it("falls back to the cached trip list when offline", async () => {
    online = false;
    idbGet.mockResolvedValue({ trips: [{ id: "9", name: "Cached Trip", created_at: "2026-01-01" }], savedAt: 42 });

    render(<TripList initialTrips={[]} />);

    expect(await screen.findByRole("link", { name: "Cached Trip" })).toBeInTheDocument();
  });
});

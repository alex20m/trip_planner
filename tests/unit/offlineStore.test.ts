import { describe, it, expect, vi } from "vitest";
import { getLastSynced, idbGet, idbSet, prefetchAllTrips, setLastSynced, tripSnapshotKey } from "@/lib/offlineStore";

describe("idbSet / idbGet", () => {
  it("returns null for a key that was never set", async () => {
    expect(await idbGet("missing-key")).toBeNull();
  });

  it("round-trips a stored value", async () => {
    await idbSet("trips-list", { trips: [{ id: "1", name: "Rome", created_at: "now" }], savedAt: 123 });
    const result = await idbGet<{ savedAt: number }>("trips-list");
    expect(result?.savedAt).toBe(123);
  });
});

describe("tripSnapshotKey", () => {
  it("namespaces the key by trip id", () => {
    expect(tripSnapshotKey("abc")).toBe("trip:abc");
  });
});

describe("last synced timestamp", () => {
  it("round-trips a shared timestamp and returns the value written", async () => {
    const written = await setLastSynced(1700000000000);
    expect(written).toBe(1700000000000);
    expect(await getLastSynced()).toBe(1700000000000);
  });

  it("defaults to the current time when no timestamp is passed", async () => {
    const before = Date.now();
    const written = await setLastSynced();
    expect(written).toBeGreaterThanOrEqual(before);
    expect(await getLastSynced()).toBe(written);
  });
});

describe("prefetchAllTrips", () => {
  it("saves a snapshot per trip using role/events/sections from Supabase", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: "edit" }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [] })
      })
    };

    await prefetchAllTrips(supabase, [{ id: "trip-1", name: "Rome" }]);

    const snapshot = await idbGet<{ role: string; trip: { name: string } }>(tripSnapshotKey("trip-1"));
    expect(snapshot?.role).toBe("edit");
    expect(snapshot?.trip.name).toBe("Rome");
  });

  it("skips a trip whose fetch fails without throwing", async () => {
    const supabase = {
      rpc: vi.fn().mockRejectedValue(new Error("boom")),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [] })
      })
    };

    await expect(prefetchAllTrips(supabase, [{ id: "trip-err", name: "Broken" }])).resolves.toBeUndefined();
  });
});

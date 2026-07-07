import { describe, it, expect, beforeEach } from "vitest";
import {
  getDeletedTripIds,
  markTripDeleted,
  unmarkTripDeleted,
  reconcileDeletedTrips
} from "@/lib/optimistic";

describe("optimistic trip deletion tracking", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts empty", () => {
    expect(getDeletedTripIds()).toEqual([]);
  });

  it("marks and unmarks trip ids without duplicates", () => {
    markTripDeleted("a");
    markTripDeleted("a");
    markTripDeleted("b");
    expect(getDeletedTripIds()).toEqual(["a", "b"]);

    unmarkTripDeleted("a");
    expect(getDeletedTripIds()).toEqual(["b"]);
  });

  it("keeps only ids still present in the server list and prunes the rest", () => {
    markTripDeleted("a");
    markTripDeleted("b");

    // "a" is still returned by the server (delete not propagated yet), "b" is gone.
    const stillPending = reconcileDeletedTrips(["a", "c"]);

    expect(stillPending).toEqual(["a"]);
    expect(getDeletedTripIds()).toEqual(["a"]);
  });

  it("clears storage once no deleted ids remain in the server list", () => {
    markTripDeleted("a");
    const stillPending = reconcileDeletedTrips(["c"]);
    expect(stillPending).toEqual([]);
    expect(window.sessionStorage.getItem("optimistically-deleted-trips")).toBeNull();
  });
});

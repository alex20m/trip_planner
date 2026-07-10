import { describe, it, expect } from "vitest";
import { canEdit, isAllDayEvent, parseDateOnly, ROLE_RANK, type TripEvent } from "@/lib/types";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "e1",
    trip_id: "t1",
    title: "Museum",
    type: "activity",
    start_at: "2026-08-05T12:00:00Z",
    end_at: null,
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: false,
    ...overrides
  };
}

describe("ROLE_RANK", () => {
  it("orders roles owner > edit > read", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.edit);
    expect(ROLE_RANK.edit).toBeGreaterThan(ROLE_RANK.read);
  });
});

describe("canEdit", () => {
  it("allows owner and edit roles", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("edit")).toBe(true);
  });

  it("denies read-only members", () => {
    expect(canEdit("read")).toBe(false);
  });

  it("denies non-members", () => {
    expect(canEdit(null)).toBe(false);
  });
});

describe("parseDateOnly", () => {
  it("parses a YYYY-MM-DD string as local midnight, not UTC", () => {
    const d = parseDateOnly("2026-08-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August is month index 7
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });
});

describe("isAllDayEvent", () => {
  it("treats accommodation as all-day regardless of the all_day flag", () => {
    expect(isAllDayEvent(makeEvent({ type: "accommodation", all_day: false }))).toBe(true);
  });

  it("treats a timed activity or travel event as not all-day", () => {
    expect(isAllDayEvent(makeEvent({ type: "activity", all_day: false }))).toBe(false);
    expect(isAllDayEvent(makeEvent({ type: "travel", all_day: false }))).toBe(false);
  });

  it("treats an activity or travel event marked all_day as all-day", () => {
    expect(isAllDayEvent(makeEvent({ type: "activity", all_day: true }))).toBe(true);
    expect(isAllDayEvent(makeEvent({ type: "travel", all_day: true }))).toBe(true);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import {
  allDayLastDay,
  allDayStart,
  assignAllDayLanes,
  isAllDayShownOnDay,
  locationLabel
} from "@/lib/calendarLayout";
import type { TripEvent } from "@/lib/types";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

function makeEvent(overrides: Partial<TripEvent>): TripEvent {
  return {
    id: "e1",
    trip_id: "t1",
    title: "Event",
    type: "activity",
    start_at: "2026-07-21T00:00:00Z",
    end_at: null,
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: true,
    ...overrides
  };
}

const day = (s: string) => new Date(`${s}T00:00:00`);

describe("stay visibility (issue #68)", () => {
  const stay = makeEvent({
    type: "accommodation",
    start_at: "2026-07-21T00:00:00Z",
    end_at: "2026-07-24T00:00:00Z"
  });

  it("shows a stay on every night slept there, but not on the check-out day", () => {
    expect(isAllDayShownOnDay(stay, day("2026-07-21"))).toBe(true);
    expect(isAllDayShownOnDay(stay, day("2026-07-22"))).toBe(true);
    expect(isAllDayShownOnDay(stay, day("2026-07-23"))).toBe(true);
    expect(isAllDayShownOnDay(stay, day("2026-07-24"))).toBe(false);
    expect(isAllDayShownOnDay(stay, day("2026-07-20"))).toBe(false);
  });

  it("keeps a stay without a check-out date on its check-in day", () => {
    const openEnded = makeEvent({ type: "accommodation", start_at: "2026-07-21T00:00:00Z", end_at: null });
    expect(+allDayLastDay(openEnded)).toBe(+allDayStart(openEnded));
    expect(isAllDayShownOnDay(openEnded, day("2026-07-21"))).toBe(true);
  });

  it("still shows non-stay all-day events on their end day", () => {
    const festival = makeEvent({ start_at: "2026-07-21T00:00:00Z", end_at: "2026-07-24T00:00:00Z" });
    expect(isAllDayShownOnDay(festival, day("2026-07-24"))).toBe(true);
    expect(isAllDayShownOnDay(festival, day("2026-07-25"))).toBe(false);
  });
});

describe("assignAllDayLanes (issue #67)", () => {
  const gridStart = day("2026-07-20"); // Monday

  it("packs a chip into the top-most free lane instead of opening a new row", () => {
    // CSS grid auto-placement put C on a third row (its cursor never moves
    // back), leaving an uneven blank gap under A. First-fit packs C next to B.
    const a = makeEvent({ id: "a", start_at: "2026-07-20T00:00:00Z", end_at: "2026-07-22T00:00:00Z" });
    const b = makeEvent({ id: "b", start_at: "2026-07-21T00:00:00Z", end_at: "2026-07-23T00:00:00Z" });
    const c = makeEvent({ id: "c", start_at: "2026-07-20T00:00:00Z", end_at: null });

    const lanes = Object.fromEntries(assignAllDayLanes([a, b, c], gridStart, 7).map((x) => [x.event.id, x.lane]));
    expect(lanes.a).toBe(0);
    expect(lanes.b).toBe(1);
    expect(lanes.c).toBe(1);
  });

  it("never assigns overlapping chips to the same lane", () => {
    const a = makeEvent({ id: "a", start_at: "2026-07-20T00:00:00Z", end_at: "2026-07-23T00:00:00Z" });
    const b = makeEvent({ id: "b", start_at: "2026-07-22T00:00:00Z", end_at: "2026-07-25T00:00:00Z" });
    const chips = assignAllDayLanes([a, b], gridStart, 7);
    expect(chips[0].lane).not.toBe(chips[1].lane);
  });

  it("clamps chips that extend beyond the visible days", () => {
    const long = makeEvent({ id: "a", start_at: "2026-07-15T00:00:00Z", end_at: "2026-08-05T00:00:00Z" });
    const [chip] = assignAllDayLanes([long], gridStart, 7);
    expect(chip.startCol).toBe(0);
    expect(chip.endCol).toBe(6);
  });

  it("packs stays below other all-day events they share a day with (issue #68)", () => {
    const stay = makeEvent({
      id: "stay",
      type: "accommodation",
      start_at: "2026-07-20T00:00:00Z",
      end_at: "2026-07-23T00:00:00Z"
    });
    const tour = makeEvent({ id: "tour", start_at: "2026-07-21T00:00:00Z", end_at: null });

    // The stay is listed first, but the tour still gets the top lane.
    const lanes = Object.fromEntries(assignAllDayLanes([stay, tour], gridStart, 7).map((x) => [x.event.id, x.lane]));
    expect(lanes.tour).toBe(0);
    expect(lanes.stay).toBe(1);
  });
});

describe("locationLabel (issue #69)", () => {
  it("joins both destinations with the direction of travel", () => {
    const leg = makeEvent({ type: "travel", location: "Helsinki", end_location: "Stockholm" });
    expect(locationLabel(leg)).toBe("Helsinki → Stockholm");
  });

  it("falls back to the plain location for non-travel events and legacy travel rows", () => {
    expect(locationLabel(makeEvent({ location: "Helsinki" }))).toBe("Helsinki");
    expect(locationLabel(makeEvent({ type: "travel", location: "Helsinki" }))).toBe("Helsinki");
  });
});

// ---------------------------------------------------------------------------
// All-day chips span calendar days, so no zone may add, drop or move a day.
// ---------------------------------------------------------------------------
describe("all-day layout is timezone-independent", () => {
  afterAll(restoreTimeZone);

  const festival = makeEvent({ start_at: "2026-07-21T00:00:00Z", end_at: "2026-07-23T00:00:00Z" });
  const stay = makeEvent({
    type: "accommodation",
    start_at: "2026-07-21T00:00:00Z",
    end_at: "2026-07-24T00:00:00Z"
  });

  it("shows an all-day event on exactly its own days, in every zone", () => {
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        expect(isAllDayShownOnDay(festival, day("2026-07-20")), `20th in ${tz}`).toBe(false);
        expect(isAllDayShownOnDay(festival, day("2026-07-21")), `21st in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(festival, day("2026-07-22")), `22nd in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(festival, day("2026-07-23")), `23rd in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(festival, day("2026-07-24")), `24th in ${tz}`).toBe(false);
      });
    }
  });

  it("keeps a stay off its check-out day in every zone", () => {
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        expect(isAllDayShownOnDay(stay, day("2026-07-23")), `23rd in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(stay, day("2026-07-24")), `24th in ${tz}`).toBe(false);
      });
    }
  });

  it("assigns the same columns and lanes in every zone", () => {
    const layout = (tz: string) =>
      inTimeZone(tz, () =>
        assignAllDayLanes([festival, stay], day("2026-07-20"), 7).map(({ event, startCol, endCol, lane }) => ({
          id: event.id,
          startCol,
          endCol,
          lane
        }))
      );
    const baseline = layout("UTC");
    for (const tz of TRAVEL_ZONES) {
      expect(layout(tz), `layout differs in ${tz}`).toEqual(baseline);
    }
    expect(baseline).toEqual([
      // Festival 21→23 and the stay's nights 21→23 both start on column 1
      // (grid starts the 20th) and end on column 3, stacked in two lanes.
      { id: "e1", startCol: 1, endCol: 3, lane: 0 },
      { id: "e1", startCol: 1, endCol: 3, lane: 1 }
    ]);
  });

  it("spans the same days across a DST transition weekend", () => {
    // 29 Mar 2026 is the European spring-forward; 6 Sep 2026 is Santiago's,
    // which happens at midnight — exactly where a date-only value sits.
    const across = makeEvent({ start_at: "2026-03-28T00:00:00Z", end_at: "2026-03-30T00:00:00Z" });
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        expect(isAllDayShownOnDay(across, day("2026-03-28")), `28th in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(across, day("2026-03-29")), `29th in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(across, day("2026-03-30")), `30th in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(across, day("2026-03-31")), `31st in ${tz}`).toBe(false);
      });
    }
    const santiago = makeEvent({ start_at: "2026-09-05T00:00:00Z", end_at: "2026-09-07T00:00:00Z" });
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        expect(isAllDayShownOnDay(santiago, day("2026-09-06")), `6 Sep in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(santiago, day("2026-09-08")), `8 Sep in ${tz}`).toBe(false);
      });
    }
  });

  it("reads a legacy row stored with a +00:00 offset on the same days", () => {
    const legacy = makeEvent({ start_at: "2026-07-21T00:00:00+00:00", end_at: "2026-07-23T00:00:00+00:00" });
    for (const tz of TRAVEL_ZONES) {
      inTimeZone(tz, () => {
        expect(isAllDayShownOnDay(legacy, day("2026-07-21")), `in ${tz}`).toBe(true);
        expect(isAllDayShownOnDay(legacy, day("2026-07-23")), `in ${tz}`).toBe(true);
      });
    }
  });
});

import { startOfWeek } from "date-fns";
import { parseDateOnly, type TripEvent } from "./types";
import { addWallClockDays, daysBetweenDayKeys, toDayKey, wallClockDay } from "./datetime";

/** Weeks run Monday–Sunday everywhere in the planner. */
export const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

/**
 * The week a trip opens on. Once the trip is under way, what matters is the
 * week being lived, not the one the trip began in — so a trip whose range
 * covers today lands on today's week. Before it starts (and after it has
 * ended) the trip's own first week is still the useful place to arrive.
 *
 * Compared on "YYYY-MM-DD" day keys: the trip's dates are calendar days, and
 * whether "today" is inside them is a calendar-day question, not an instant.
 */
export function initialWeekStart(startDate: string, endDate: string, today: Date = new Date()): Date {
  const todayKey = toDayKey(today);
  const started = todayKey >= wallClockDay(startDate) && todayKey <= wallClockDay(endDate);
  return startOfWeek(started ? today : parseDateOnly(startDate), WEEK_OPTIONS);
}

// All-day events cover whole calendar days, so all the logic below works on
// "YYYY-MM-DD" day keys rather than on `Date` objects.
//
// Reading a stored value with `new Date(iso)` would resolve it through the
// device's timezone: in any zone ahead of UTC it lands after local midnight,
// so an event's first day failed `allDayStart(e) <= day` and the chip silently
// dropped off the calendar. Comparing `Date`s has a subtler version of the
// same problem even once the value is right — a `Date` is an instant, and
// which calendar day it names depends on the zone reading it (and on whether
// that zone's DST happens to change at midnight, as Santiago's does).
//
// Day keys have neither problem: they are the calendar day, and string order
// is date order.
export const allDayStartKey = (e: TripEvent) => wallClockDay(e.start_at);
export const allDayEndKey = (e: TripEvent) => (e.end_at ? wallClockDay(e.end_at) : allDayStartKey(e));

// The last calendar day an all-day event occupies. A stay's end date is the
// check-out day — no night is spent there — so a stay 21.7–24.7 occupies
// 21, 22 and 23.7 only. Other all-day events include their end day.
export const allDayLastDayKey = (e: TripEvent) => {
  const end = allDayEndKey(e);
  if (e.type !== "accommodation") return end;
  const lastNight = addWallClockDays(end, -1);
  const start = allDayStartKey(e);
  return lastNight < start ? start : lastNight;
};

// `Date` flavours of the above, for callers that need to feed date-fns.
export const allDayStart = (e: TripEvent) => parseDateOnly(allDayStartKey(e));
export const allDayEnd = (e: TripEvent) => parseDateOnly(allDayEndKey(e));
export const allDayLastDay = (e: TripEvent) => parseDateOnly(allDayLastDayKey(e));

export const isAllDayShownOnDay = (e: TripEvent, day: Date) => {
  const key = toDayKey(day);
  return allDayStartKey(e) <= key && allDayLastDayKey(e) >= key;
};

/** True when an all-day event touches any day in `[fromDay, toDay]` (inclusive). */
export const isAllDayInRange = (e: TripEvent, fromDay: Date, toDay: Date) =>
  allDayStartKey(e) <= toDayKey(toDay) && allDayLastDayKey(e) >= toDayKey(fromDay);

export interface AllDayChip {
  event: TripEvent;
  /** 0-based first day column the chip covers, clamped to the visible days. */
  startCol: number;
  /** 0-based last day column the chip covers, clamped to the visible days. */
  endCol: number;
  /** 0-based row in the all-day strip. */
  lane: number;
}

// Lays out the week strip's all-day chips into explicit rows. Relying on CSS
// grid auto-placement here caused uneven vertical gaps: its placement cursor
// only moves forward, so a chip whose column starts before the cursor is
// pushed to a fresh row even when an earlier row has space, leaving blank
// row-sized holes between chips in the same day column. First-fit packing
// into the top-most free lane keeps every gap exactly one row gap.
// Stays are packed after other all-day events so that, on any day they share
// with one, the stay sits below it (a stay is the day's last event).
export function assignAllDayLanes(events: TripEvent[], gridStart: Date, dayCount: number): AllDayChip[] {
  const gridKey = toDayKey(gridStart);
  const ordered = [...events].sort(
    (a, b) =>
      Number(a.type === "accommodation") - Number(b.type === "accommodation") ||
      (allDayStartKey(a) < allDayStartKey(b) ? -1 : allDayStartKey(a) > allDayStartKey(b) ? 1 : 0) ||
      (allDayLastDayKey(b) < allDayLastDayKey(a) ? -1 : allDayLastDayKey(b) > allDayLastDayKey(a) ? 1 : 0)
  );
  const lanes: { startCol: number; endCol: number }[][] = [];
  return ordered.map((event) => {
    const startCol = Math.max(0, daysBetweenDayKeys(gridKey, allDayStartKey(event)));
    const endCol = Math.min(dayCount - 1, daysBetweenDayKeys(gridKey, allDayLastDayKey(event)));
    let lane = lanes.findIndex((l) => l.every((c) => c.endCol < startCol || c.startCol > endCol));
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane].push({ startCol, endCol });
    return { event, startCol, endCol, lane };
  });
}

// One-line location label for calendar cards. A travel leg runs between two
// places, so both show with the direction of travel.
export function locationLabel(e: TripEvent): string | null {
  if (e.type === "travel" && e.location && e.end_location) return `${e.location} → ${e.end_location}`;
  return e.location;
}

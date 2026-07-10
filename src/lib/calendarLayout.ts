import { addDays, differenceInCalendarDays } from "date-fns";
import { parseDateOnly, type TripEvent } from "./types";

// All-day events' start_at/end_at are stored as UTC-midnight date-only values.
// Parsing them with `new Date(iso)` keeps that UTC instant, which in any
// timezone ahead of UTC lands after local midnight — so an event's first
// day fails `allDayStart(e) <= day` and silently drops off. Route through
// parseDateOnly (local midnight, like the calendar's `day` values) instead.
export const allDayStart = (e: TripEvent) => parseDateOnly(e.start_at.slice(0, 10));
export const allDayEnd = (e: TripEvent) => (e.end_at ? parseDateOnly(e.end_at.slice(0, 10)) : allDayStart(e));

// The last calendar day an all-day event occupies. A stay's end date is the
// check-out day — no night is spent there — so a stay 21.7–24.7 occupies
// 21, 22 and 23.7 only. Other all-day events include their end day.
export const allDayLastDay = (e: TripEvent) => {
  const end = allDayEnd(e);
  if (e.type !== "accommodation") return end;
  const lastNight = addDays(end, -1);
  const start = allDayStart(e);
  return lastNight < start ? start : lastNight;
};

export const isAllDayShownOnDay = (e: TripEvent, day: Date) => allDayStart(e) <= day && allDayLastDay(e) >= day;

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
  const ordered = [...events].sort(
    (a, b) =>
      Number(a.type === "accommodation") - Number(b.type === "accommodation") ||
      +allDayStart(a) - +allDayStart(b) ||
      +allDayLastDay(b) - +allDayLastDay(a)
  );
  const lanes: { startCol: number; endCol: number }[][] = [];
  return ordered.map((event) => {
    const startCol = Math.max(0, differenceInCalendarDays(allDayStart(event), gridStart));
    const endCol = Math.min(dayCount - 1, differenceInCalendarDays(allDayLastDay(event), gridStart));
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

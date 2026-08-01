import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Wall-clock times
// ---------------------------------------------------------------------------
//
// An event time in PlanPal is a *wall-clock* time: exactly the date and time
// that was typed into the form, with no timezone attached to it. "Dinner at
// 19:00" is 19:00 whether you open the app at home, on the plane, or after
// landing three timezones away.
//
// This used to be handled the other way around: the composer converted the
// typed time into a UTC instant (`new Date(local).toISOString()`) and every
// view converted it back through `new Date(iso)`, i.e. through *the device's
// current* timezone. Both halves cancel out only while the device stays in the
// zone the event was created in — travel to another country and every time in
// the trip silently shifted. That is precisely the trip planner's worst case.
//
// So nothing here ever consults the host timezone. Values are parsed into
// their literal calendar fields and rendered from those fields. The only place
// a `Date` object is created is for formatting *date* parts (weekday and month
// names), and that one is anchored at local noon so no DST transition can
// nudge it onto a neighbouring day.
//
// Storage: the canonical form is "YYYY-MM-DDTHH:mm:ssZ". The trailing Z is
// there so Postgres reads the value the same way whether the column is
// `timestamp` (offset ignored) or still the legacy `timestamptz` (parsed as
// UTC, returned as UTC) — in both cases the calendar fields survive the round
// trip untouched, which is all this convention cares about. Legacy rows that
// come back with a real offset are normalised to their UTC fields, matching
// how they were written before this change.

export interface WallClockParts {
  year: number;
  /** 1-12, not the 0-11 that `Date` uses. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Date, optional time, optional fractional seconds, optional offset (Z, ±HH,
// ±HH:MM or ±HHMM — PostgREST emits "+00:00", raw Postgres text emits "+00").
const WALL_CLOCK_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, "0");

/** Minutes to add to a value carrying `offset` to get its UTC fields. */
function offsetMinutes(offset: string): number {
  if (/^z$/i.test(offset)) return 0;
  const sign = offset[0] === "-" ? -1 : 1;
  const digits = offset.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  return sign * (hours * 60 + minutes);
}

function partsFromUtcMillis(ms: number): WallClockParts {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds()
  };
}

/**
 * Split a stored value into its literal calendar fields. Returns null for
 * anything unparseable so callers can render a placeholder instead of "NaN".
 */
export function wallClockParts(value: string | null | undefined): WallClockParts | null {
  if (!value) return null;
  const m = WALL_CLOCK_RE.exec(value.trim());
  if (!m) return null;
  const parts: WallClockParts = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
    second: Number(m[6] ?? 0)
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null;
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;
  const offset = m[7];
  if (!offset) return parts;
  const delta = offsetMinutes(offset);
  if (delta === 0) return parts;
  // Legacy row written with a real offset: keep the instant it denotes and
  // read its UTC fields, which is the wall clock the old code displayed to
  // whoever created it.
  return partsFromUtcMillis(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - delta * 60000
  );
}

/** UTC millis standing in for the wall clock — for DST-free arithmetic only. */
function toUtcMillis(p: WallClockParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function stampFrom(p: WallClockParts): string {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** The calendar date, "YYYY-MM-DD". Empty string when the value is unusable. */
export function wallClockDay(value: string | null | undefined): string {
  const p = wallClockParts(value);
  return p ? `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}` : "";
}

/** The clock reading, "HH:mm". Empty string when the value is unusable. */
export function wallClockTime(value: string | null | undefined): string {
  const p = wallClockParts(value);
  return p ? `${pad(p.hour)}:${pad(p.minute)}` : "";
}

/**
 * Canonical "YYYY-MM-DDTHH:mm:ss". Lexicographic order on this string is
 * chronological order, so it doubles as a sort/compare key.
 */
export function wallClockStamp(value: string | null | undefined): string {
  const p = wallClockParts(value);
  return p ? stampFrom(p) : "";
}

/** Chronological comparator for two stored values, for `Array#sort`. */
export function compareWallClock(a: string | null | undefined, b: string | null | undefined): number {
  const x = wallClockStamp(a);
  const y = wallClockStamp(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Minutes since midnight — what the week grid positions blocks by. */
export function wallClockMinutes(value: string | null | undefined): number {
  const p = wallClockParts(value);
  return p ? p.hour * 60 + p.minute + p.second / 60 : 0;
}

/**
 * Whole minutes from `start` to `end`. Computed on the calendar fields, so a
 * DST transition in the viewer's zone can't stretch or squash an event.
 */
export function wallClockDiffMinutes(start: string | null | undefined, end: string | null | undefined): number {
  const a = wallClockParts(start);
  const b = wallClockParts(end);
  if (!a || !b) return 0;
  return (toUtcMillis(b) - toUtcMillis(a)) / 60000;
}

/**
 * A `Date` for formatting and comparing *dates* (never times) with date-fns.
 * Anchored at local noon: the calendar day is then immune to every real-world
 * DST transition, which all happen near midnight.
 */
export function wallClockDayDate(value: string | null | undefined): Date {
  const p = wallClockParts(value);
  if (!p) return new Date(NaN);
  return new Date(p.year, p.month - 1, p.day, 12, 0, 0, 0);
}

/** Format the date part (no time tokens) of a stored value. */
export function formatWallClockDay(
  value: string | null | undefined,
  pattern: string,
  options?: Parameters<typeof format>[2]
): string {
  const d = wallClockDayDate(value);
  return isNaN(+d) ? "" : format(d, pattern, options);
}

/**
 * The calendar day a `Date` falls on, "YYYY-MM-DD". Comparing these strings
 * instead of the `Date`s themselves keeps day-level logic away from instants,
 * where an offset or a midnight DST transition can tip a comparison onto the
 * neighbouring day.
 */
export function toDayKey(d: Date): string {
  if (isNaN(+d)) return "";
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from one "YYYY-MM-DD" key to another. Negative if `to` is earlier. */
export function daysBetweenDayKeys(from: string, to: string): number {
  const a = wallClockParts(from);
  const b = wallClockParts(to);
  if (!a || !b) return 0;
  return Math.round((toUtcMillis({ ...b, hour: 0, minute: 0, second: 0 }) -
    toUtcMillis({ ...a, hour: 0, minute: 0, second: 0 })) / 86400000);
}

/** True when a stored value falls on `day` (a local `Date` from the calendar). */
export function isOnWallClockDay(value: string | null | undefined, day: Date): boolean {
  const p = wallClockParts(value);
  if (!p) return false;
  return p.year === day.getFullYear() && p.month === day.getMonth() + 1 && p.day === day.getDate();
}

/** Value for a `<input type="datetime-local">`: "YYYY-MM-DDTHH:mm". */
export function toDateTimeInputValue(value: string | null | undefined): string {
  const p = wallClockParts(value);
  return p ? `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}` : "";
}

// Every writer below returns "" for input the parser can't make sense of —
// half-typed pickers and cleared fields reach these. The composer already
// treats an empty start/end as "not filled in yet" and says so, which beats
// throwing out of an onMouseDown handler.

/**
 * Storage form for a typed "YYYY-MM-DDTHH:mm" (or any parseable value): the
 * same calendar fields, never shifted. This is the function that replaced
 * `new Date(local).toISOString()`.
 */
export function toStoredWallClock(value: string | null | undefined): string {
  const p = wallClockParts(value);
  return p ? `${stampFrom(p)}Z` : "";
}

/** Storage form for an all-day event's "YYYY-MM-DD": midnight on that date. */
export function toStoredDateOnly(date: string | null | undefined): string {
  const p = wallClockParts(date);
  return p ? `${stampFrom({ ...p, hour: 0, minute: 0, second: 0 })}Z` : "";
}

/** Add minutes to a "YYYY-MM-DDTHH:mm" input value, DST-free. */
export function addWallClockMinutes(value: string | null | undefined, minutes: number): string {
  const p = wallClockParts(value);
  if (!p) return "";
  return toDateTimeInputValue(stampFrom(partsFromUtcMillis(toUtcMillis(p) + minutes * 60000)));
}

/** Add days to a "YYYY-MM-DD" date value, DST-free. */
export function addWallClockDays(date: string | null | undefined, days: number): string {
  const p = wallClockParts(date);
  if (!p) return "";
  return wallClockDay(stampFrom(partsFromUtcMillis(toUtcMillis(p) + days * 86400000)));
}

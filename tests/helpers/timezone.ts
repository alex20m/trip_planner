import { afterAll, beforeEach } from "vitest";

// Timezone matrix for the "times must never move" regression suites.
//
// The bug these guard against only shows up when the device's zone changes
// between writing a time and reading it back — i.e. exactly what happens when
// you fly somewhere. So every one of these suites runs the same assertions in
// every zone below, and the zones are picked to be nasty on purpose:
//
//  - UTC                  the CI default, and the baseline everything else
//                         must match byte for byte
//  - Europe/Helsinki      "home": UTC+2, +3 in summer
//  - America/New_York     behind UTC, so a naive conversion moves times to the
//                         previous day
//  - Asia/Tokyo           ahead of UTC with no DST at all
//  - Pacific/Kiritimati   UTC+14, the furthest ahead any place on earth is
//  - Pacific/Niue         UTC-11, near the other extreme
//  - Asia/Kathmandu       UTC+05:45 — not a whole number of hours
//  - Australia/Lord_Howe  UTC+10:30/+11:00 — a *half hour* DST step
//  - America/Santiago     southern-hemisphere DST, transitions at midnight
export const TRAVEL_ZONES = [
  "UTC",
  "Europe/Helsinki",
  "America/New_York",
  "Asia/Tokyo",
  "Pacific/Kiritimati",
  "Pacific/Niue",
  "Asia/Kathmandu",
  "Australia/Lord_Howe",
  "America/Santiago"
] as const;

const ORIGINAL_TZ = process.env.TZ;

/**
 * Point the process at `tz`. Node re-reads `process.env.TZ` on assignment and
 * clears V8's cached zone, so every `Date` created afterwards behaves as if
 * the machine had been carried there.
 */
export function setTimeZone(tz: string): void {
  process.env.TZ = tz;
}

export function restoreTimeZone(): void {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}

/** Run the surrounding `describe` block as if the device were in `tz`. */
export function useTimeZone(tz: string): void {
  // beforeEach rather than beforeAll: sibling suites for other zones would
  // otherwise fight over the process-wide setting once they interleave.
  beforeEach(() => setTimeZone(tz));
  afterAll(() => restoreTimeZone());
}

/** Run `fn` as if the device were in `tz`, then put the zone back. */
export function inTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  setTimeZone(tz);
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

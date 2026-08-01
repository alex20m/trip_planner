import { describe, it, expect, afterAll } from "vitest";
import { enUS } from "date-fns/locale";
import {
  addWallClockDays,
  addWallClockMinutes,
  compareWallClock,
  formatWallClockDay,
  isOnWallClockDay,
  toDateTimeInputValue,
  toStoredDateOnly,
  toStoredWallClock,
  wallClockDay,
  wallClockDayDate,
  wallClockDiffMinutes,
  wallClockMinutes,
  wallClockParts,
  wallClockStamp,
  wallClockTime
} from "@/lib/datetime";
import { TRAVEL_ZONES, inTimeZone, restoreTimeZone } from "../helpers/timezone";

afterAll(restoreTimeZone);

/** Assert `fn` returns the same thing in every zone in the matrix. */
function sameEverywhere<T>(fn: () => T): T {
  const baseline = inTimeZone("UTC", fn);
  for (const tz of TRAVEL_ZONES) {
    expect(inTimeZone(tz, fn), `differs in ${tz}`).toEqual(baseline);
  }
  return baseline;
}

// If this ever fails, every "same in every timezone" assertion below has
// quietly become a no-op: the process is not actually changing zones, so the
// matrix is testing UTC nine times over.
describe("the timezone harness itself", () => {
  it("really moves the process between zones", () => {
    const instant = "2026-08-05T12:00:00Z";
    const hours = TRAVEL_ZONES.map((tz) => inTimeZone(tz, () => new Date(instant).getHours()));
    expect(new Set(hours).size).toBeGreaterThan(1);
    expect(inTimeZone("UTC", () => new Date(instant).getHours())).toBe(12);
    expect(inTimeZone("Asia/Tokyo", () => new Date(instant).getHours())).toBe(21);
    expect(inTimeZone("America/New_York", () => new Date(instant).getHours())).toBe(8);
  });

  it("reproduces the bug the wall-clock helpers exist to prevent", () => {
    // The old code path, verbatim: store the typed time as an instant, read it
    // back through the device's zone. Same input, different answers.
    const stored = inTimeZone("Europe/Helsinki", () => new Date("2026-08-05T19:00").toISOString());
    const reopened = TRAVEL_ZONES.map((tz) =>
      inTimeZone(tz, () => new Date(new Date(stored).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16))
    );
    expect(new Set(reopened).size).toBeGreaterThan(1);

    // The replacement gives one answer everywhere.
    const fixed = inTimeZone("Europe/Helsinki", () => toStoredWallClock("2026-08-05T19:00"));
    expect(new Set(TRAVEL_ZONES.map((tz) => inTimeZone(tz, () => toDateTimeInputValue(fixed))))).toEqual(
      new Set(["2026-08-05T19:00"])
    );
  });

  it("restores the original zone after each block", () => {
    const before = process.env.TZ;
    inTimeZone("Pacific/Kiritimati", () => undefined);
    expect(process.env.TZ).toBe(before);
  });
});

describe("wallClockParts", () => {
  it("reads the literal fields of a bare date-time", () => {
    expect(wallClockParts("2026-08-05T09:07:03")).toEqual({
      year: 2026,
      month: 8,
      day: 5,
      hour: 9,
      minute: 7,
      second: 3
    });
  });

  it("ignores a trailing Z — the fields are the value, not an instant", () => {
    expect(wallClockParts("2026-08-05T09:07:03Z")).toEqual(wallClockParts("2026-08-05T09:07:03"));
  });

  it("ignores a +00:00 offset and fractional seconds", () => {
    expect(wallClockParts("2026-08-05T09:07:03.482+00:00")).toEqual(wallClockParts("2026-08-05T09:07:03"));
  });

  it("accepts the '+00' offset raw Postgres text uses", () => {
    expect(wallClockParts("2026-08-05 09:07:03+00")).toEqual(wallClockParts("2026-08-05T09:07:03"));
  });

  it("accepts a space instead of the T separator", () => {
    expect(wallClockParts("2026-08-05 09:07")).toEqual(wallClockParts("2026-08-05T09:07:00"));
  });

  it("defaults a date-only value to midnight", () => {
    expect(wallClockParts("2026-08-05")).toEqual({ year: 2026, month: 8, day: 5, hour: 0, minute: 0, second: 0 });
  });

  it("normalises a legacy value carrying a real offset to its UTC fields", () => {
    // 12:00+03:00 is 09:00 UTC — the wall clock the old code stored and showed.
    expect(wallClockParts("2026-08-05T12:00:00+03:00")).toEqual(wallClockParts("2026-08-05T09:00:00"));
    expect(wallClockParts("2026-08-05T05:00:00-04:00")).toEqual(wallClockParts("2026-08-05T09:00:00"));
    expect(wallClockParts("2026-08-05T14:45:00+0545")).toEqual(wallClockParts("2026-08-05T09:00:00"));
  });

  it("rolls the date when a real offset crosses midnight", () => {
    expect(wallClockParts("2026-08-05T01:00:00+03:00")).toEqual(wallClockParts("2026-08-04T22:00:00"));
    expect(wallClockParts("2026-08-05T23:00:00-04:00")).toEqual(wallClockParts("2026-08-06T03:00:00"));
  });

  it("returns null for values it cannot make sense of", () => {
    for (const bad of ["", "   ", "not a date", "2026-13-01T00:00", "2026-08-32", "2026-08-05T25:00", null, undefined]) {
      expect(wallClockParts(bad as string | null | undefined)).toBeNull();
    }
  });

  it("reads the same fields in every timezone", () => {
    for (const value of [
      "2026-08-05T09:07:03",
      "2026-08-05T09:07:03Z",
      "2026-01-05T23:59:59+00:00",
      "2026-08-05T12:00:00+03:00"
    ]) {
      sameEverywhere(() => wallClockParts(value));
    }
  });
});

describe("wallClockDay / wallClockTime / wallClockStamp", () => {
  it("splits a stored value into date and clock reading", () => {
    expect(wallClockDay("2026-08-05T09:07:03Z")).toBe("2026-08-05");
    expect(wallClockTime("2026-08-05T09:07:03Z")).toBe("09:07");
    expect(wallClockStamp("2026-08-05T09:07:03Z")).toBe("2026-08-05T09:07:03");
  });

  it("zero-pads every field", () => {
    expect(wallClockDay("2026-01-02T03:04:05Z")).toBe("2026-01-02");
    expect(wallClockTime("2026-01-02T03:04:05Z")).toBe("03:04");
    expect(wallClockStamp("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05");
  });

  it("returns empty strings rather than NaN for unusable values", () => {
    expect(wallClockDay("nonsense")).toBe("");
    expect(wallClockTime(null)).toBe("");
    expect(wallClockStamp(undefined)).toBe("");
  });

  it("reads midnight as 00:00 on its own date, not the day before", () => {
    // The classic symptom: UTC midnight rendered in a zone behind UTC used to
    // slide back into the previous evening.
    sameEverywhere(() => [wallClockDay("2026-08-05T00:00:00Z"), wallClockTime("2026-08-05T00:00:00Z")]);
    expect(wallClockDay("2026-08-05T00:00:00Z")).toBe("2026-08-05");
    expect(wallClockTime("2026-08-05T00:00:00Z")).toBe("00:00");
  });

  it("reads 23:59 as the same date, not the next one", () => {
    sameEverywhere(() => [wallClockDay("2026-08-05T23:59:00Z"), wallClockTime("2026-08-05T23:59:00Z")]);
    expect(wallClockDay("2026-08-05T23:59:00Z")).toBe("2026-08-05");
    expect(wallClockTime("2026-08-05T23:59:00Z")).toBe("23:59");
  });

  it("renders the same clock reading in every timezone", () => {
    for (const value of ["2026-08-05T00:00:00Z", "2026-08-05T13:30:00Z", "2026-12-31T23:59:00Z"]) {
      sameEverywhere(() => `${wallClockDay(value)} ${wallClockTime(value)}`);
    }
  });

  it("survives a DST spring-forward gap in the viewing zone", () => {
    // 03:30 on 29 Mar 2026 does not exist in Europe/Helsinki (02:59:59 EET is
    // followed by 04:00:00 EEST). A Date built from those fields there silently
    // becomes 04:30 — which is why nothing here goes through one.
    const value = "2026-03-29T03:30:00Z";
    sameEverywhere(() => wallClockTime(value));
    expect(inTimeZone("Europe/Helsinki", () => wallClockTime(value))).toBe("03:30");
  });

  it("survives a DST fall-back ambiguity in the viewing zone", () => {
    // 01:30 on 1 Nov 2026 happens twice in America/New_York.
    const value = "2026-11-01T01:30:00Z";
    sameEverywhere(() => wallClockTime(value));
    expect(inTimeZone("America/New_York", () => wallClockTime(value))).toBe("01:30");
  });

  it("survives the half-hour DST step on Lord Howe Island", () => {
    const value = "2026-10-04T02:15:00Z";
    sameEverywhere(() => wallClockTime(value));
    expect(inTimeZone("Australia/Lord_Howe", () => wallClockTime(value))).toBe("02:15");
  });
});

describe("compareWallClock", () => {
  it("orders values chronologically", () => {
    expect(compareWallClock("2026-08-05T09:00:00Z", "2026-08-05T10:00:00Z")).toBeLessThan(0);
    expect(compareWallClock("2026-08-05T10:00:00Z", "2026-08-05T09:00:00Z")).toBeGreaterThan(0);
    expect(compareWallClock("2026-08-05T09:00:00Z", "2026-08-05T09:00:00")).toBe(0);
  });

  it("sorts a day's events the same way everywhere", () => {
    const times = ["2026-08-05T18:00:00Z", "2026-08-05T07:30:00Z", "2026-08-05T00:15:00Z", "2026-08-05T23:45:00Z"];
    const sorted = sameEverywhere(() => [...times].sort(compareWallClock));
    expect(sorted).toEqual([
      "2026-08-05T00:15:00Z",
      "2026-08-05T07:30:00Z",
      "2026-08-05T18:00:00Z",
      "2026-08-05T23:45:00Z"
    ]);
  });
});

describe("wallClockMinutes", () => {
  it("counts minutes since midnight", () => {
    expect(wallClockMinutes("2026-08-05T00:00:00Z")).toBe(0);
    expect(wallClockMinutes("2026-08-05T06:00:00Z")).toBe(360);
    expect(wallClockMinutes("2026-08-05T13:45:00Z")).toBe(825);
    expect(wallClockMinutes("2026-08-05T23:59:00Z")).toBe(1439);
  });

  it("is 0 for unusable values so a block never lands at NaN", () => {
    expect(wallClockMinutes("nope")).toBe(0);
  });

  it("puts a block at the same height in every timezone", () => {
    sameEverywhere(() => wallClockMinutes("2026-08-05T09:30:00Z"));
  });
});

describe("wallClockDiffMinutes", () => {
  it("measures a plain duration", () => {
    expect(wallClockDiffMinutes("2026-08-05T09:00:00Z", "2026-08-05T10:30:00Z")).toBe(90);
  });

  it("measures across midnight", () => {
    expect(wallClockDiffMinutes("2026-08-05T23:00:00Z", "2026-08-06T01:00:00Z")).toBe(120);
  });

  it("is negative when the end precedes the start", () => {
    expect(wallClockDiffMinutes("2026-08-05T10:00:00Z", "2026-08-05T09:00:00Z")).toBe(-60);
  });

  it("does not stretch or squash an event over a DST transition", () => {
    // A 2-hour event spanning the European spring-forward: a real-instant
    // duration would come out as 1 hour in a zone that jumps that night.
    const minutes = sameEverywhere(() => wallClockDiffMinutes("2026-03-29T02:00:00Z", "2026-03-29T04:00:00Z"));
    expect(minutes).toBe(120);
  });

  it("is 0 when either end is unusable", () => {
    expect(wallClockDiffMinutes("2026-08-05T09:00:00Z", null)).toBe(0);
    expect(wallClockDiffMinutes(null, "2026-08-05T09:00:00Z")).toBe(0);
  });
});

describe("wallClockDayDate", () => {
  it("lands on the stored calendar day, anchored at noon", () => {
    const d = wallClockDayDate("2026-08-05T23:30:00Z");
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 8, 5, 12]);
  });

  it("keeps the same calendar day in every timezone, at both ends of the day", () => {
    for (const value of ["2026-08-05T00:00:00Z", "2026-08-05T23:59:00Z"]) {
      sameEverywhere(() => {
        const d = wallClockDayDate(value);
        return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      });
    }
  });

  it("is an invalid date for unusable values", () => {
    expect(Number.isNaN(+wallClockDayDate("nope"))).toBe(true);
  });
});

describe("formatWallClockDay", () => {
  it("formats the date part with date-fns patterns", () => {
    expect(formatWallClockDay("2026-08-05T23:30:00Z", "EEE d MMM yyyy", { locale: enUS })).toBe("Wed 5 Aug 2026");
  });

  it("formats the same date in every timezone, even at midnight", () => {
    const label = sameEverywhere(() =>
      formatWallClockDay("2026-08-05T00:00:00Z", "EEE d MMM yyyy", { locale: enUS })
    );
    expect(label).toBe("Wed 5 Aug 2026");
  });

  it("returns an empty string for unusable values", () => {
    expect(formatWallClockDay(null, "d MMM")).toBe("");
  });
});

describe("isOnWallClockDay", () => {
  it("matches a value against a calendar day", () => {
    const day = new Date(2026, 7, 5);
    expect(isOnWallClockDay("2026-08-05T00:00:00Z", day)).toBe(true);
    expect(isOnWallClockDay("2026-08-05T23:59:00Z", day)).toBe(true);
    expect(isOnWallClockDay("2026-08-04T23:59:00Z", day)).toBe(false);
    expect(isOnWallClockDay("2026-08-06T00:00:00Z", day)).toBe(false);
  });

  it("assigns an event to the same day in every timezone", () => {
    // Both ends of the day, which is where a zone shift used to move an event
    // onto the neighbouring column.
    for (const value of ["2026-08-05T00:30:00Z", "2026-08-05T23:30:00Z"]) {
      sameEverywhere(() => isOnWallClockDay(value, new Date(2026, 7, 5)));
      expect(isOnWallClockDay(value, new Date(2026, 7, 5))).toBe(true);
    }
  });

  it("is false for unusable values", () => {
    expect(isOnWallClockDay(null, new Date(2026, 7, 5))).toBe(false);
  });
});

describe("toDateTimeInputValue", () => {
  it("produces the value a datetime-local input expects", () => {
    expect(toDateTimeInputValue("2026-08-05T09:07:03Z")).toBe("2026-08-05T09:07");
  });

  it("gives the editor the time that was typed, wherever it is reopened", () => {
    const stored = "2026-08-05T19:00:00Z";
    const value = sameEverywhere(() => toDateTimeInputValue(stored));
    expect(value).toBe("2026-08-05T19:00");
  });

  it("is empty for a missing value", () => {
    expect(toDateTimeInputValue(null)).toBe("");
  });
});

describe("toStoredWallClock", () => {
  it("keeps the typed fields exactly", () => {
    expect(toStoredWallClock("2026-08-05T19:00")).toBe("2026-08-05T19:00:00Z");
  });

  it("stores the same value no matter where the composer is open", () => {
    const stored = sameEverywhere(() => toStoredWallClock("2026-08-05T19:00"));
    expect(stored).toBe("2026-08-05T19:00:00Z");
  });

  it("round-trips back to the editor unchanged, across a move between zones", () => {
    const stored = inTimeZone("Europe/Helsinki", () => toStoredWallClock("2026-08-05T19:00"));
    for (const tz of TRAVEL_ZONES) {
      expect(inTimeZone(tz, () => toDateTimeInputValue(stored)), `reopened in ${tz}`).toBe("2026-08-05T19:00");
    }
  });

  it("survives many round trips without drifting", () => {
    let value = "2026-08-05T19:00";
    for (const tz of TRAVEL_ZONES) {
      value = inTimeZone(tz, () => toDateTimeInputValue(toStoredWallClock(value)));
    }
    expect(value).toBe("2026-08-05T19:00");
  });

  it("is empty for a half-filled picker", () => {
    expect(toStoredWallClock("")).toBe("");
    expect(toStoredWallClock("2026-08")).toBe("");
  });
});

describe("toStoredDateOnly", () => {
  it("stores midnight on the given date", () => {
    expect(toStoredDateOnly("2026-08-05")).toBe("2026-08-05T00:00:00Z");
  });

  it("drops any time that came with the value", () => {
    expect(toStoredDateOnly("2026-08-05T18:30")).toBe("2026-08-05T00:00:00Z");
  });

  it("stores the same date in every timezone", () => {
    sameEverywhere(() => toStoredDateOnly("2026-08-05"));
  });

  it("is empty for a cleared field", () => {
    expect(toStoredDateOnly("")).toBe("");
  });
});

describe("addWallClockMinutes", () => {
  it("adds an hour for the end-time prefill", () => {
    expect(addWallClockMinutes("2026-08-05T19:00", 60)).toBe("2026-08-05T20:00");
  });

  it("rolls over midnight", () => {
    expect(addWallClockMinutes("2026-08-05T23:30", 60)).toBe("2026-08-06T00:30");
  });

  it("rolls over a year boundary", () => {
    expect(addWallClockMinutes("2026-12-31T23:30", 60)).toBe("2027-01-01T00:30");
  });

  it("subtracts with a negative amount", () => {
    expect(addWallClockMinutes("2026-08-05T00:30", -60)).toBe("2026-08-04T23:30");
  });

  it("adds a real hour across a DST boundary, in every zone", () => {
    // Local arithmetic would skip to 05:00 in Helsinki on this date.
    const next = sameEverywhere(() => addWallClockMinutes("2026-03-29T03:00", 60));
    expect(next).toBe("2026-03-29T04:00");
  });

  it("is empty for an unusable value", () => {
    expect(addWallClockMinutes("", 60)).toBe("");
  });
});

describe("addWallClockDays", () => {
  it("adds a day for the check-out prefill", () => {
    expect(addWallClockDays("2026-08-05", 1)).toBe("2026-08-06");
  });

  it("crosses a month boundary", () => {
    expect(addWallClockDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("crosses a leap day", () => {
    expect(addWallClockDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("subtracts with a negative amount", () => {
    expect(addWallClockDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("adds exactly one day across a DST transition, in every zone", () => {
    // 2026-03-29 is the European spring-forward; a local-midnight Date on
    // Santiago's transition night has the same trap in the other direction.
    sameEverywhere(() => addWallClockDays("2026-03-28", 1));
    expect(addWallClockDays("2026-03-28", 1)).toBe("2026-03-29");
    sameEverywhere(() => addWallClockDays("2026-09-05", 1));
  });

  it("is empty for an unusable value", () => {
    expect(addWallClockDays(null, 1)).toBe("");
  });
});

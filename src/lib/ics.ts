import { isAllDayEvent, type TripEvent } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

// UTC datetime in the form 20260511T130000Z
function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// Date without time in the form 20260511 (all-day events are saved at UTC midnight)
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function addDaysDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

// RFC 5545: escape special characters in text values
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 §3.1: no content line may exceed 75 octets (excluding CRLF), and a
// multi-octet UTF-8 character MUST NOT be split across a fold. We therefore
// measure in UTF-8 bytes and only ever break on code-point boundaries;
// continuation lines start with a single space (which counts toward the 75).
//
// The previous version folded on `String.length` (UTF-16 code units), so a
// break could land in the middle of a surrogate pair (emoji) or count a
// multi-byte char as one octet. The first corrupts the feed with invalid UTF-8
// once encoded — and calendar clients like Apple's silently drop events whose
// VEVENT contains it — so events with emoji or accented place names would go
// missing while plain-ASCII ones came through.
const enc = new TextEncoder();
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let curLen = 0; // octets already on the current physical line
  // `for..of` iterates by code point, so a surrogate pair is one step and its
  // bytes are never split.
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curLen + n > 75) {
      out.push(cur);
      cur = " " + ch; // continuation line begins with a space
      curLen = 1 + n;
    } else {
      cur += ch;
      curLen += n;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

export interface IcsTrip {
  id: string;
  name: string;
  // "YYYY-MM-DD"; optional so feeds keep working if a trip predates the date columns.
  start_date?: string | null;
  end_date?: string | null;
}

export function buildICS(trip: IcsTrip, events: TripEvent[], host: string): string {
  const now = fmtUTC(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PlanPal//EN//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(trip.name),
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M"
  ];

  // Single all-day event spanning the whole trip: an at-a-glance "on the trip" marker.
  // TRANSP:TRANSPARENT keeps the days from counting as busy/blocked time.
  // DTEND is exclusive in iCal, i.e. last day + 1.
  if (trip.start_date && trip.end_date) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:trip-span-" + trip.id + "@" + host);
    lines.push("DTSTAMP:" + now);
    lines.push("SEQUENCE:0");
    lines.push("DTSTART;VALUE=DATE:" + fmtDate(`${trip.start_date}T00:00:00Z`));
    lines.push("DTEND;VALUE=DATE:" + addDaysDate(`${trip.end_date}T00:00:00Z`, 1));
    lines.push("TRANSP:TRANSPARENT");
    lines.push("SUMMARY:" + esc("🌍 " + trip.name));
    lines.push("END:VEVENT");
  }

  for (const e of events) {
    const updatedAt = (e as TripEvent & { updated_at?: string }).updated_at;
    const seq = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
    const prefix = e.type === "travel" ? "🧳 " : e.type === "accommodation" ? "🛏 " : "";

    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + e.id + "@" + host);
    lines.push("DTSTAMP:" + now);
    lines.push("SEQUENCE:" + seq);
    if (updatedAt) lines.push("LAST-MODIFIED:" + fmtUTC(updatedAt));

    if (isAllDayEvent(e)) {
      // All-day event; DTEND is exclusive in iCal, i.e. last day + 1
      lines.push("DTSTART;VALUE=DATE:" + fmtDate(e.start_at));
      lines.push("DTEND;VALUE=DATE:" + (e.end_at ? addDaysDate(e.end_at, 1) : addDaysDate(e.start_at, 1)));
    } else {
      lines.push("DTSTART:" + fmtUTC(e.start_at));
      if (e.end_at) lines.push("DTEND:" + fmtUTC(e.end_at));
    }

    lines.push("SUMMARY:" + esc(prefix + e.title));
    // Travel legs run between two places; show the direction in the location.
    const location = e.type === "travel" && e.location && e.end_location ? `${e.location} → ${e.end_location}` : e.location;
    if (location) lines.push("LOCATION:" + esc(location));
    if (e.description) lines.push("DESCRIPTION:" + esc(e.description));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // Fold every line at emit time so any long value (a title, a description, or
  // even a long UID/host) is wrapped safely — never just the few we used to
  // fold inline.
  return lines.map(fold).join("\r\n") + "\r\n";
}

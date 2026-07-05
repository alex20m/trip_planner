import type { TripEvent } from "./types";

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

// Date without time in the form 20260511 (accommodation is saved at UTC midnight)
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

// RFC 5545: fold lines longer than 75 chars (char-based approx, fine for latin/emoji)
function fold(line: string): string {
  const out: string[] = [];
  let l = line;
  while (l.length > 74) {
    out.push(l.slice(0, 74));
    l = " " + l.slice(74);
  }
  out.push(l);
  return out.join("\r\n");
}

export function buildICS(tripName: string, events: TripEvent[], host: string): string {
  const now = fmtUTC(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TripPlan//EN//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold("X-WR-CALNAME:" + esc(tripName)),
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M"
  ];

  for (const e of events) {
    const updatedAt = (e as TripEvent & { updated_at?: string }).updated_at;
    const seq = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
    const prefix = e.type === "travel" ? "✈ " : e.type === "accommodation" ? "🛏 " : "";

    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + e.id + "@" + host);
    lines.push("DTSTAMP:" + now);
    lines.push("SEQUENCE:" + seq);
    if (updatedAt) lines.push("LAST-MODIFIED:" + fmtUTC(updatedAt));

    if (e.type === "accommodation") {
      // All-day event; DTEND is exclusive in iCal, i.e. check-out day + 1
      lines.push("DTSTART;VALUE=DATE:" + fmtDate(e.start_at));
      lines.push("DTEND;VALUE=DATE:" + (e.end_at ? addDaysDate(e.end_at, 1) : addDaysDate(e.start_at, 1)));
    } else {
      lines.push("DTSTART:" + fmtUTC(e.start_at));
      if (e.end_at) lines.push("DTEND:" + fmtUTC(e.end_at));
    }

    lines.push(fold("SUMMARY:" + esc(prefix + e.title)));
    if (e.location) lines.push(fold("LOCATION:" + esc(e.location)));
    if (e.description) lines.push(fold("DESCRIPTION:" + esc(e.description)));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

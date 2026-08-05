import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const tripResult = { data: null as Row | null };
const eventsResult = { data: [] as Row[] };
// The options the route hands to createClient — the cache-busting fetch lives here.
let clientOptions: any;
const queriedColumns: [string, unknown][] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    clientOptions = options;
    return {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: (col: string, val: unknown) => (queriedColumns.push([col, val]), chain),
          order: () => Promise.resolve(eventsResult),
          single: () => Promise.resolve(tripResult)
        };
        if (table === "trip_events") chain.then = (r: (v: unknown) => void) => r(eventsResult);
        return chain;
      }
    };
  }
}));

import { GET } from "@/app/api/calendar/[token]/route";

const TRIP = { id: "trip-1", name: "Rome", start_date: "2026-08-01", end_date: "2026-08-07" };
const EVENT = {
  id: "e1",
  trip_id: "trip-1",
  title: "Flight to Rome",
  type: "travel",
  start_at: "2026-08-01T08:00:00Z",
  end_at: "2026-08-01T11:00:00Z",
  location: "FCO",
  description: null,
  all_day: false
};

function feed(token = "tok123") {
  return GET(new Request(`https://planpal.test/api/calendar/${token}`), { params: { token } });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  queriedColumns.length = 0;
  clientOptions = undefined;
  tripResult.data = TRIP;
  eventsResult.data = [EVENT];
});

describe("GET /api/calendar/[token]", () => {
  it("serves the trip's events as a subscribable calendar", async () => {
    const res = await feed();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("Flight to Rome");
    expect(body).toContain("END:VCALENDAR");
  });

  it("finds the trip by its secret calendar token, not by id", async () => {
    await feed("some-secret-token");
    expect(queriedColumns).toContainEqual(["calendar_token", "some-secret-token"]);
  });

  it("404s on an unknown or rotated-away token without reading any events", async () => {
    tripResult.data = null;

    const res = await feed("stale-token");

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(queriedColumns).not.toContainEqual(["trip_id", expect.anything()]);
  });

  it("still returns a subscribable calendar for a trip with no events yet", async () => {
    eventsResult.data = [];

    const res = await feed();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("BEGIN:VCALENDAR");
    // The trip's own all-day span is always there, so subscribing to an
    // empty trip still shows something in the calendar.
    expect(body).toContain("SUMMARY:🌍 Rome");
    expect(body).not.toContain("Flight to Rome");
    expect(body).toContain("END:VCALENDAR");
  });

  it("names the downloaded file after the trip", async () => {
    const res = await feed();
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="trip-1.ics"');
  });

  it("tells calendar clients never to reuse a cached copy", async () => {
    const res = await feed();
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("bypasses the Next.js data cache on the Supabase reads", async () => {
    // The service-role client sends a constant Authorization header and queries
    // trip_events by trip_id, so Next's fetch cache froze the feed on an old
    // snapshot: newly added events never showed up in subscribed calendars.
    await feed();

    const globalFetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", globalFetch);

    await clientOptions.global.fetch("https://db.test/rest/v1/trip_events", { method: "GET" });

    expect(globalFetch).toHaveBeenCalledWith(
      "https://db.test/rest/v1/trip_events",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
    vi.unstubAllGlobals();
  });

  it("does not persist a session for this stateless public read", async () => {
    await feed();
    expect(clientOptions.auth).toEqual({ persistSession: false, autoRefreshToken: false });
  });
});

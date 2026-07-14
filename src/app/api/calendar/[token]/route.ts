import { createClient } from "@supabase/supabase-js";
import { buildICS } from "@/lib/ics";

// Always fresh — the feed is generated live on every request so it reflects the latest data.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  // Calendar clients can't send Supabase auth, so access is via the secret
  // token in the URL. Service role bypasses RLS for this single read.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      // This is a stateless per-request read; don't touch any session store.
      auth: { persistSession: false, autoRefreshToken: false },
      // supabase-js runs its PostgREST reads through the global fetch, which
      // Next.js wraps with its Data Cache. The service-role client sends a
      // constant Authorization header and hits constant query URLs — the
      // trip_events lookup is keyed by trip_id, NOT the calendar token — so
      // Next caches the response and freezes the feed on an old snapshot:
      // newly added events never appear, and rotating the token can't help
      // because the underlying query URL is unchanged. Force every request to
      // bypass the cache so the feed is genuinely live. `dynamic`/`fetchCache`
      // above cover the route's own fetches; this covers supabase-js's too.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" })
      }
    }
  );

  const { data: trip } = await admin
    .from("trips")
    .select("id, name, start_date, end_date")
    .eq("calendar_token", params.token)
    .single();

  if (!trip) return new Response("Not found", { status: 404 });

  const { data: events } = await admin
    .from("trip_events")
    .select("*")
    .eq("trip_id", trip.id)
    .order("start_at");

  const host = new URL(req.url).host;
  const ics = buildICS(trip, events ?? [], host);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${trip.id}.ics"`,
      "Cache-Control": "no-cache, max-age=0, must-revalidate"
    }
  });
}

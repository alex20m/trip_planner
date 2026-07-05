import { createClient } from "@supabase/supabase-js";
import { buildICS } from "@/lib/ics";

// Always fresh — the feed is generated live on every request so it reflects the latest data.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  // Calendar clients can't send Supabase auth, so access is via the secret
  // token in the URL. Service role bypasses RLS for this single read.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: trip } = await admin
    .from("trips")
    .select("id, name")
    .eq("calendar_token", params.token)
    .single();

  if (!trip) return new Response("Not found", { status: 404 });

  const { data: events } = await admin
    .from("trip_events")
    .select("*")
    .eq("trip_id", trip.id)
    .order("start_at");

  const host = new URL(req.url).host;
  const ics = buildICS(trip.name, events ?? [], host);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${trip.id}.ics"`,
      "Cache-Control": "no-cache, max-age=0, must-revalidate"
    }
  });
}

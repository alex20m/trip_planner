import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import TripView from "@/components/TripView";
import type { TripRole } from "@/lib/types";

export default async function TripPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trip } = await supabase.from("trips").select("*").eq("id", params.id).single();
  if (!trip) notFound();

  const [{ data: role }, { data: events }, { data: sections }] = await Promise.all([
    supabase.rpc("my_role", { p_trip: params.id }),
    supabase.from("trip_events").select("*").eq("trip_id", params.id).order("start_at"),
    supabase
      .from("note_sections")
      .select("*, notes(*)")
      .eq("trip_id", params.id)
      .order("sort_order")
  ]);

  return (
    <TripView
      trip={trip}
      role={(role as TripRole) ?? "read"}
      initialEvents={events ?? []}
      initialSections={(sections ?? []).map((s: any) => ({
        ...s,
        notes: (s.notes ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order)
      }))}
    />
  );
}

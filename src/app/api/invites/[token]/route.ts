import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Accept (requires sign-in — the RPC adds auth.uid() as a member)
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { action } = await req.json();

  if (action === "accept") {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const { data, error } = await supabase.rpc("accept_invite", { p_token: params.token });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, tripId: data });
  }

  if (action === "decline") {
    // Declining requires no sign-in — the token is enough. Service role bypasses RLS.
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await admin
      .from("trip_invites")
      .update({ status: "declined" })
      .eq("token", params.token)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// Fetch invite info (trip name + role) without sign-in
export async function GET(_: Request, { params }: { params: { token: string } }) {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await admin
    .from("trip_invites")
    .select("email, role, status, trips(name)")
    .eq("token", params.token)
    .single();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    email: data.email,
    role: data.role,
    status: data.status,
    tripName: (data as any).trips?.name
  });
}

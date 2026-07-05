import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { tripId, email, role } = await req.json();
  if (!tripId || !email || !["read", "edit"].includes(role)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Insert is validated by the DB trigger: at most the inviter's own access level.
  const { data: invite, error } = await supabase
    .from("trip_invites")
    .insert({ trip_id: tripId, email: email.toLowerCase(), role, invited_by: user.id })
    .select("token, trips(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const base = process.env.NEXT_PUBLIC_APP_URL!;
  const url = `${base}/invite/${invite.token}`;
  const tripName = (invite as any).trips?.name ?? "a trip";
  const roleLabel = role === "edit" ? "edit" : "view";

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: mailError } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? "PlanPal <onboarding@resend.dev>",
    to: email,
    subject: `You've been invited to ${tripName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Invitation to ${tripName}</h2>
        <p>${user.email} has invited you with <b>${roleLabel}</b> access.</p>
        <p>
          <a href="${url}?action=accept" style="background:#182230;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Accept</a>
          &nbsp;&nbsp;
          <a href="${url}?action=decline" style="color:#666">Decline</a>
        </p>
        <p style="color:#888;font-size:12px">The link takes you to PlanPal to confirm your choice.</p>
      </div>`
  });

  if (mailError) return NextResponse.json({ error: "Could not send email: " + mailError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

// Trip names and inviter emails are user-controlled and land straight in the
// email HTML below, so escape them to avoid markup injection in the sent mail.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  const tripName = escapeHtml((invite as any).trips?.name ?? "a trip");
  const inviterEmail = escapeHtml(user.email ?? "Someone");
  const roleLabel = role === "edit" ? "edit" : "view";

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: mailError } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? "PlanPal <onboarding@resend.dev>",
    to: email,
    subject: `You've been invited to ${tripName}`,
    html: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF8F4;">
        <tr>
          <td align="center" style="padding:40px 16px; font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:400px;">

              <tr>
                <td style="background-color:#FFFFFF; border:1px solid #ECE6DE; border-radius:20px; padding:36px 32px; text-align:center;">

                  <h1 style="margin:0 0 12px; font-family:Georgia,serif; font-size:22px; color:#29211B;">Join ${tripName}</h1>
                  <p style="margin:0 0 24px; font-size:14px; color:#6B625A;">${inviterEmail} invited you with <b>${roleLabel}</b> access.</p>

                  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                    <tr>
                      <td bgcolor="#C15F3C" style="border-radius:999px;">
                        <a href="${url}?action=accept" style="display:inline-block; padding:13px 32px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none;">Accept</a>
                      </td>
                      <td style="width:12px;"></td>
                      <td bgcolor="#FFFFFF" style="border:1px solid #ECE6DE; border-radius:999px;">
                        <a href="${url}?action=decline" style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#29211B; text-decoration:none;">Decline</a>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

              <tr>
                <td style="padding:20px 8px 0; text-align:center; font-size:12px; color:#A39A90;">
                  The link takes you to PlanPal to confirm your choice.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>`
  });

  if (mailError) return NextResponse.json({ error: "Could not send email: " + mailError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

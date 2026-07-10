import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  // Supabase can hand the magic link back two ways depending on the email
  // template / flow: the PKCE flow returns `?code=`, while the token-hash flow
  // returns `?token_hash=&type=`. Handle both so the link works regardless.
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = createClient();
  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = { message: "Sign-in link is missing its token." };
  }

  // On failure, bounce back to /login with a message instead of silently
  // landing on a page the auth guard immediately redirects away from — that
  // dead-end is what makes a broken link look like it "does nothing".
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 303 See Other so the browser follows the redirect as a GET; the default
  // 307 would re-issue this POST against /login, which has no POST handler.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

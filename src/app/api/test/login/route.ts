import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Test-only sign-in shortcut so e2e tests can authenticate against a local
// Supabase instance without receiving a real magic-link email. Only reachable
// when E2E_TEST_LOGIN_SECRET is set — that variable must never be set outside
// CI/local test runs, so this route is a 404 in every real deployment.
export async function POST(request: NextRequest) {
  const secret = process.env.E2E_TEST_LOGIN_SECRET;
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.headers.get("x-e2e-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link) {
    return NextResponse.json({ error: linkError?.message ?? "Could not generate link" }, { status: 500 });
  }

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  // "magiclink" is deprecated as a verifyOtp() type — "email" is the
  // supported type for verifying a token_hash regardless of how it was sent.
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email"
  });
  if (verifyError || !verified.session) {
    return NextResponse.json({ error: verifyError?.message ?? "Could not verify" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs: { name: string; value: string; options: CookieOptions }[]) =>
          cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      }
    }
  );
  await supabase.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token
  });

  return response;
}

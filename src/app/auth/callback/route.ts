import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
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

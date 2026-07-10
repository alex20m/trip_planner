import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Sign-in is code-only (OTP): the login page verifies the emailed code
// client-side, so there is no magic-link GET handler here. This route exists
// solely to sign the user out.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 303 See Other so the browser follows the redirect as a GET; the default
  // 307 would re-issue this POST against /login, which has no POST handler.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

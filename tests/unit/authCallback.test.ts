import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { signOut, exchangeCodeForSession, verifyOtp } })
}));

import { GET, POST } from "@/app/auth/callback/route";

describe("auth callback GET (sign in)", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("exchanges a PKCE code and redirects to the target", async () => {
    const res = await GET(new NextRequest("http://localhost/auth/callback?code=abc&next=/trips"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("http://localhost/trips");
  });

  it("verifies a token_hash magic link and redirects home by default", async () => {
    const res = await GET(
      new NextRequest("http://localhost/auth/callback?token_hash=xyz&type=email")
    );
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "xyz", type: "email" });
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("redirects to /login with the error message when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(new NextRequest("http://localhost/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=expired");
  });

  it("redirects to /login when neither a code nor a token_hash is present", async () => {
    const res = await GET(new NextRequest("http://localhost/auth/callback"));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("http://localhost/login?error=");
  });
});

describe("auth callback POST (sign out)", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("signs the user out", async () => {
    await POST(new NextRequest("http://localhost/auth/callback?signout=1", { method: "POST" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("redirects to /login as a GET via 303 See Other", async () => {
    const res = await POST(
      new NextRequest("http://localhost/auth/callback?signout=1", { method: "POST" })
    );
    // 303 forces the browser to follow the redirect with GET; a 307 would
    // replay the POST against /login (which has no POST handler) and 404.
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });
});

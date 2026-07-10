import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { signOut } })
}));

import { POST } from "@/app/auth/callback/route";

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

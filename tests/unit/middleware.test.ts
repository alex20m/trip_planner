// @vitest-environment node
// The middleware runs on the edge runtime, and NextResponse.next() rejects a
// request whose Headers come from jsdom's realm rather than the global one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let cookieAdapter: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};
const createServerClient = vi.fn((_url: string, _key: string, opts: any) => {
  cookieAdapter = opts.cookies;
  return { auth: { getUser } };
});

vi.mock("@supabase/ssr", () => ({ createServerClient: (...args: unknown[]) => (createServerClient as any)(...args) }));

import { middleware, config } from "@/middleware";

function request(cookies: Record<string, string> = {}) {
  const req = new NextRequest("https://planpal.test/trips/t1");
  Object.entries(cookies).forEach(([name, value]) => req.cookies.set(name, value));
  return req;
}

/** Does the matcher regex let this path through to the middleware? */
function matches(path: string) {
  return new RegExp(`^${config.matcher[0]}$`).test(path);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  createServerClient.mockClear();
});

describe("middleware — session refresh", () => {
  it("refreshes the session on every matched request", async () => {
    await middleware(request());

    // Without this call the access token is never refreshed, and a signed-in
    // user is bounced to /login the moment their token expires.
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("passes the request's cookies to Supabase so an existing session is recognised", async () => {
    await middleware(request({ "sb-access-token": "token-value" }));

    expect(cookieAdapter.getAll().find((c) => c.name === "sb-access-token")?.value).toBe("token-value");
  });

  it("writes refreshed auth cookies back onto the response", async () => {
    // Supabase hands back rotated cookies from inside getUser(), before the
    // middleware returns its response.
    getUser.mockImplementation(async () => {
      cookieAdapter.setAll([{ name: "sb-access-token", value: "refreshed", options: { path: "/" } }]);
      return { data: { user: { id: "u1" } } };
    });

    const res = await middleware(request({ "sb-access-token": "stale" }));

    // A refreshed token that never reaches the browser means the next request
    // arrives with the stale one and the refresh was pointless.
    expect(res.cookies.get("sb-access-token")?.value).toBe("refreshed");
  });

  it("makes the refreshed cookies visible to the page rendering this same request", async () => {
    getUser.mockImplementation(async () => {
      cookieAdapter.setAll([{ name: "sb-access-token", value: "refreshed", options: { path: "/" } }]);
      return { data: { user: { id: "u1" } } };
    });
    const req = request({ "sb-access-token": "stale" });

    await middleware(req);

    // Server components read the request's cookies, so a refresh that only
    // updated the response would leave the page rendering as signed-out.
    expect(req.cookies.get("sb-access-token")?.value).toBe("refreshed");
  });

  it("lets the request continue even when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(request());

    // Auth gating is the pages' job — the middleware must not redirect, or
    // /login itself would become unreachable.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — which requests it runs on", () => {
  it.each([["/"], ["/login"], ["/trips/t1"], ["/settings"], ["/api/invites"]])(
    "runs on %s",
    (path) => {
      expect(matches(path)).toBe(true);
    }
  );

  it.each([
    ["/_next/static/chunks/main.js"],
    ["/_next/image"],
    ["/favicon.ico"],
    ["/sw.js"],
    ["/manifest.json"],
    ["/icons/icon-192.png"]
  ])("skips %s", (path) => {
    // Running a Supabase round-trip for each static asset and for the service
    // worker would add latency to every page load for no benefit.
    expect(matches(path)).toBe(false);
  });
});

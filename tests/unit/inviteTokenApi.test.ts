import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const update = vi.fn();
const single = vi.fn();
// Every .eq(column, value) the route narrows the query with, in order.
const eqCalls: [string, unknown][] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser }, rpc })
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => {
      const chain = {
        update: (patch: unknown) => (update(patch), chain),
        select: () => chain,
        eq: (col: string, val: unknown) => (eqCalls.push([col, val]), chain),
        single,
        then: (resolve: (v: unknown) => void) => resolve(update.mock.results.at(-1)?.value ?? { error: null })
      };
      return chain;
    }
  })
}));

import { GET, POST } from "@/app/api/invites/[token]/route";

const params = { token: "tok123" };

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/invites/tok123", { method: "POST", body: JSON.stringify(body) }),
    { params }
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  eqCalls.length = 0;
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockReset().mockResolvedValue({ data: "trip-1", error: null });
  update.mockReset().mockReturnValue({ error: null });
  single.mockReset();
});

describe("POST /api/invites/[token] — accepting", () => {
  it("adds the signed-in user to the trip and reports where to go next", async () => {
    const res = await post({ action: "accept" });

    expect(rpc).toHaveBeenCalledWith("accept_invite", { p_token: "tok123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tripId: "trip-1" });
  });

  it("asks a signed-out visitor to log in instead of accepting on their behalf", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await post({ action: "accept" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "login_required" });
    // Nothing may be granted before we know who is accepting.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a 400 with the reason when the invite is expired or already used", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invite is no longer pending" } });

    const res = await post({ action: "accept" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invite is no longer pending" });
  });
});

describe("POST /api/invites/[token] — declining", () => {
  it("lets a signed-out recipient decline using the token alone", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await post({ action: "decline" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ status: "declined" });
  });

  it("only declines the matching invite, and only while it is still pending", async () => {
    await post({ action: "decline" });

    // Without the status filter, a decline link clicked after acceptance would
    // silently downgrade an invite the recipient had already taken up.
    expect(eqCalls).toEqual([
      ["token", "tok123"],
      ["status", "pending"]
    ]);
  });

  it("reports a 400 with the reason when the update fails", async () => {
    update.mockReturnValue({ error: { message: "row level security" } });

    const res = await post({ action: "decline" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "row level security" });
  });
});

describe("POST /api/invites/[token] — unknown actions", () => {
  it.each([["revoke"], [""], [undefined]])("rejects %o without touching the invite", async (action) => {
    const res = await post({ action });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown action" });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("GET /api/invites/[token]", () => {
  it("describes the invite to a visitor who is not signed in yet", async () => {
    single.mockResolvedValue({
      data: { email: "friend@example.com", role: "edit", status: "pending", trips: { name: "Rome" } }
    });

    const res = await GET(new Request("http://localhost/api/invites/tok123"), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "friend@example.com",
      role: "edit",
      status: "pending",
      tripName: "Rome"
    });
    expect(eqCalls).toEqual([["token", "tok123"]]);
    // The invite page must render without a session.
    expect(getUser).not.toHaveBeenCalled();
  });

  it("404s on an unknown or revoked token", async () => {
    single.mockResolvedValue({ data: null });

    const res = await GET(new Request("http://localhost/api/invites/tok123"), { params });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("still answers when the joined trip row is missing", async () => {
    single.mockResolvedValue({ data: { email: "a@b.c", role: "read", status: "pending", trips: null } });

    const res = await GET(new Request("http://localhost/api/invites/tok123"), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "a@b.c",
      role: "read",
      status: "pending",
      tripName: undefined
    });
  });
});

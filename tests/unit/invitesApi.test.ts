import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const insert = vi.fn();
const single = vi.fn();
const send = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => {
      expect(table).toBe("trip_invites");
      return { insert: (row: unknown) => (insert(row), { select: () => ({ single }) }) };
    }
  })
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } }))
}));

import { POST } from "@/app/api/invites/route";

function request(body: unknown) {
  return new Request("http://localhost/api/invites", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

const VALID = { tripId: "t1", email: "Friend@Example.com", role: "read" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://planpal.test");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "me@example.com" } } });
  insert.mockReset();
  single.mockReset().mockResolvedValue({ data: { token: "tok123", trips: { name: "Rome" } }, error: null });
  send.mockReset().mockResolvedValue({ error: null });
});

describe("POST /api/invites — request validation", () => {
  it.each([
    ["a missing trip id", { ...VALID, tripId: undefined }],
    ["a missing email", { ...VALID, email: undefined }],
    ["a role the app does not grant by invite", { ...VALID, role: "owner" }],
    ["a garbage role", { ...VALID, role: "admin" }]
  ])("rejects %s with 400 and never sends mail", async (_label, body) => {
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts the edit role", async () => {
    const res = await POST(request({ ...VALID, role: "edit" }));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ role: "edit" }));
  });
});

describe("POST /api/invites — authorization", () => {
  it("refuses to invite anyone when the caller is not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(request(VALID));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
    // The signed-out caller must not reach the table or the mail provider.
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("surfaces the database refusal as 403 when the trigger blocks over-granting", async () => {
    // The DB trigger rejects an invite above the inviter's own access level.
    single.mockResolvedValue({ data: null, error: { message: "cannot grant more access than you have" } });

    const res = await POST(request({ ...VALID, role: "edit" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cannot grant more access than you have" });
    // No invitation mail may go out for an invite the database refused.
    expect(send).not.toHaveBeenCalled();
  });
});

describe("POST /api/invites — the stored invite", () => {
  it("stores the email lowercased so it matches the address the recipient signs in with", async () => {
    await POST(request({ ...VALID, email: "Friend@Example.COM" }));

    expect(insert).toHaveBeenCalledWith({
      trip_id: "t1",
      email: "friend@example.com",
      role: "read",
      invited_by: "u1"
    });
  });

  it("mails the original address as typed", async () => {
    await POST(request({ ...VALID, email: "Friend@Example.com" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "Friend@Example.com" }));
  });
});

describe("POST /api/invites — the invitation email", () => {
  it("links to accept and decline for this invite's token", async () => {
    await POST(request(VALID));

    const { html, subject } = send.mock.calls[0][0];
    expect(subject).toBe("You've been invited to Rome");
    expect(html).toContain('href="https://planpal.test/invite/tok123?action=accept"');
    expect(html).toContain('href="https://planpal.test/invite/tok123?action=decline"');
  });

  it("names the access level the recipient is being given", async () => {
    await POST(request({ ...VALID, role: "edit" }));
    expect(send.mock.calls[0][0].html).toContain("<b>edit</b>");

    send.mockClear();
    await POST(request({ ...VALID, role: "read" }));
    expect(send.mock.calls[0][0].html).toContain("<b>view</b>");
  });

  it("escapes a trip name that contains markup instead of injecting it into the mail", async () => {
    single.mockResolvedValue({
      data: { token: "tok123", trips: { name: `<img src=x onerror="alert(1)">Rome` } },
      error: null
    });

    await POST(request(VALID));

    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Rome");
  });

  it("leaves the subject line unescaped so apostrophes read as typed", async () => {
    // The subject is plain text, not HTML: escaping it turned "Alex's Trip"
    // into "Alex&#39;s Trip" in the recipient's inbox.
    single.mockResolvedValue({ data: { token: "tok123", trips: { name: "Alex's Trip & Co" } }, error: null });

    await POST(request(VALID));

    expect(send.mock.calls[0][0].subject).toBe("You've been invited to Alex's Trip & Co");
    // The HTML body still escapes it.
    expect(send.mock.calls[0][0].html).toContain("Alex&#39;s Trip &amp; Co");
  });

  it("escapes the inviter's email address too", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: `"><script>x()</script>` } } });

    await POST(request(VALID));

    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;x()&lt;/script&gt;");
  });

  it("falls back to neutral wording when the trip name or inviter email is missing", async () => {
    single.mockResolvedValue({ data: { token: "tok123", trips: null }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: null } } });

    await POST(request(VALID));

    const { html, subject } = send.mock.calls[0][0];
    expect(subject).toBe("You've been invited to a trip");
    expect(html).toContain("Someone invited you");
  });
});

describe("POST /api/invites — mail delivery failures", () => {
  it("reports a 500 with the provider's reason when the mail cannot be sent", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });

    const res = await POST(request(VALID));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not send email: domain not verified" });
  });

  it("reports success only once the mail provider accepted the message", async () => {
    const res = await POST(request(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

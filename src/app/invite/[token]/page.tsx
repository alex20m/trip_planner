"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InviteInfo = { email: string; role: string; status: string; tripName: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "declined" | "needsLogin" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setInfo(d);
        if (d.status !== "pending") {
          setState("error");
          setMessage("This invitation has already been answered.");
        } else {
          setState("ready");
          const action = search.get("action");
          if (action === "decline") decline();
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Invitation not found.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accept() {
    const res = await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" })
    });
    if (res.status === 401) {
      setState("needsLogin");
      return;
    }
    const body = await res.json();
    if (res.ok) router.push(`/trips/${body.tripId}`);
    else {
      setState("error");
      setMessage(body.error);
    }
  }

  async function decline() {
    await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" })
    });
    setState("declined");
  }

  async function loginThenAccept(email: string) {
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/invite/${token}` }
    });
    setMessage("Check your inbox — sign in and come back here to accept.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6 text-center">
      {state === "loading" && <p className="text-ink/50">Loading…</p>}
      {state === "error" && <p className="text-ink/70">{message}</p>}
      {state === "declined" && <p className="text-ink/70">You have declined the invitation.</p>}
      {(state === "ready" || state === "needsLogin") && info && (
        <>
          <h1 className="mb-1 text-2xl font-bold">{info.tripName}</h1>
          <p className="mb-6 text-ink/60">
            You&apos;ve been invited with <b>{info.role === "edit" ? "edit" : "view"}</b> access.
          </p>
          {state === "ready" ? (
            <div className="flex justify-center gap-3">
              <button onClick={decline} className="rounded-xl border border-ink/20 px-5 py-2.5 font-medium">
                Decline
              </button>
              <button onClick={accept} className="rounded-xl bg-ink px-5 py-2.5 font-medium text-white">
                Accept
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-ink/60">Sign in first to accept:</p>
              <button
                onClick={() => loginThenAccept(info.email)}
                className="rounded-xl bg-ink px-5 py-2.5 font-medium text-white"
              >
                Send sign-in link to {info.email}
              </button>
              {message && <p className="mt-3 text-sm text-stay">{message}</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}

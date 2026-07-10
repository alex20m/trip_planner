"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import CodeInput from "@/components/CodeInput";

const CODE_LENGTH = 6;

type InviteInfo = { email: string; role: string; status: string; tripName: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "declined" | "needsLogin" | "error">("loading");
  const [message, setMessage] = useState("");
  const [loginError, setLoginError] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  // Which action is in flight — only that button gets a spinner, both stay disabled.
  const [busy, setBusy] = useState<"accept" | "decline" | "login" | "verify" | null>(null);

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
    setBusy("accept");
    const res = await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" })
    });
    if (res.status === 401) {
      setBusy(null);
      setState("needsLogin");
      return;
    }
    const body = await res.json();
    if (res.ok) router.push(`/trips/${body.tripId}`);
    else {
      setBusy(null);
      setState("error");
      setMessage(body.error);
    }
  }

  async function decline() {
    setBusy("decline");
    await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" })
    });
    setBusy(null);
    setState("declined");
  }

  async function sendInviteCode(email: string) {
    setBusy("login");
    setLoginError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(null);
    if (error) {
      setLoginError(error.message);
    } else {
      setCodeSent(true);
      setMessage(`Enter the ${CODE_LENGTH}-digit code sent to ${email}.`);
    }
  }

  // Verify the emailed code, then accept the invite on the now-authenticated
  // session. `next` passes the freshly completed code before state flushes.
  async function verifyInviteCode(email: string, next?: string) {
    const token = (next ?? code).trim();
    if (busy || token.length !== CODE_LENGTH) return;
    setBusy("verify");
    setLoginError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      setBusy(null);
      setLoginError(error.message);
      return;
    }
    await accept();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12 text-center">
      {state === "loading" && (
        <div className="flex justify-center">
          <Spinner className="h-6 w-6 text-ink/40" />
        </div>
      )}
      {state === "error" && <p className="text-ink/60">{message}</p>}
      {state === "declined" && <p className="text-ink/60">You have declined the invitation.</p>}
      {(state === "ready" || state === "needsLogin") && info && (
        <>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">{info.tripName}</h1>
          <p className="mb-6 text-ink/55">
            You&apos;ve been invited with <b className="font-medium text-ink">{info.role === "edit" ? "edit" : "view"}</b> access.
          </p>
          {state === "ready" ? (
            <div className="flex justify-center gap-3">
              <button onClick={decline} disabled={busy !== null} className="btn-secondary px-5">
                {busy === "decline" && <Spinner className="h-4 w-4" />}
                Decline
              </button>
              <button onClick={accept} disabled={busy !== null} className="btn-primary px-5">
                {busy === "accept" && <Spinner className="h-4 w-4" />}
                Accept
              </button>
            </div>
          ) : (
            <div>
              {codeSent ? (
                <div className="space-y-4">
                  {message && <p className="text-sm text-ink/55">{message}</p>}
                  <CodeInput
                    length={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                    onComplete={(c) => verifyInviteCode(info.email, c)}
                    disabled={busy === "verify" || busy === "accept"}
                  />
                  <button
                    onClick={() => verifyInviteCode(info.email)}
                    disabled={busy !== null || code.trim().length !== CODE_LENGTH}
                    className="btn-primary w-full"
                  >
                    {(busy === "verify" || busy === "accept") && <Spinner className="h-4 w-4" />}
                    {busy === "verify" || busy === "accept" ? "Verifying…" : "Verify & accept"}
                  </button>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm text-ink/55">Sign in first to accept:</p>
                  <button onClick={() => sendInviteCode(info.email)} disabled={busy !== null} className="btn-primary px-5">
                    {busy === "login" && <Spinner className="h-4 w-4" />}
                    Email a code to {info.email}
                  </button>
                </>
              )}
              {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}

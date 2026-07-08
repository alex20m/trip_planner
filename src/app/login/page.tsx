"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import Logo from "@/components/Logo";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function sendLink() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verifyCode() {
    if (verifying || code.trim().length < 6) return;
    setError(null);
    setVerifying(true);
    const supabase = createClient();
    // Same email carries both the magic link and this 6-digit code — verifying
    // the code signs in directly on whatever origin the user is on, without
    // going through /auth/callback or the redirect-URL allowlist at all.
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setVerifying(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-2">
        <Logo className="h-10 w-10" textClassName="text-3xl" />
      </h1>
      <p className="mb-8 text-ink/55">Sign in with a magic link or code sent to your email.</p>
      {sent ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-stay/20 bg-stay/10 p-4 text-sm text-stay">
            Check your inbox — click the link, or enter the 6-digit code below.
          </p>
          {/* Codes are 6 digits (Supabase "Email OTP length", see SETUP.md), but the
              field tolerates up to 10 so a project still sending longer codes doesn't
              lock users out by silently truncating what they paste. */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && verifyCode()}
            placeholder="6-digit code"
            disabled={verifying}
            maxLength={10}
            className="field text-center text-lg tracking-[0.3em]"
          />
          <button onClick={verifyCode} disabled={verifying || code.trim().length < 6} className="btn-primary w-full">
            {verifying && <Spinner className="h-4 w-4" />}
            {verifying ? "Verifying…" : "Verify code"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            disabled={busy || verifying}
            className="btn-secondary w-full"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && sendLink()}
            placeholder="you@email.com"
            disabled={busy}
            className="field"
          />
          <button onClick={sendLink} disabled={busy || !email} className="btn-primary w-full">
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? "Sending…" : "Send sign-in link"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}

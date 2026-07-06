"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import Logo from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-2">
        <Logo className="h-10 w-10" textClassName="text-3xl" />
      </h1>
      <p className="mb-8 text-ink/55">Sign in with a magic link sent to your email.</p>
      {sent ? (
        <p className="rounded-xl border border-stay/20 bg-stay/10 p-4 text-sm text-stay">
          Check your inbox — the link signs you in directly.
        </p>
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

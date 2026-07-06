"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">PlanPal</h1>
      <p className="mb-8 text-ink/60">Sign in with a magic link sent to your email.</p>
      {sent ? (
        <p className="rounded-xl bg-stay/10 p-4 text-stay">
          Check your inbox — the link signs you in directly.
        </p>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-xl border border-ink/20 bg-surface p-3 outline-none focus:border-activity"
          />
          <button
            onClick={sendLink}
            className="w-full rounded-xl bg-charcoal p-3 font-medium text-white hover:bg-charcoal/90"
          >
            Send sign-in link
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}

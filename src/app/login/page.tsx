"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import CodeInput from "@/components/CodeInput";
import Logo from "@/components/Logo";

const CODE_LENGTH = 6;

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // A magic link that fails to sign in redirects back here with ?error=…;
  // read it on mount and drop it from the URL so it doesn't stick around.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkError = params.get("error");
    if (linkError) {
      setError(linkError);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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

  // `next` lets the auto-submit pass the freshly completed code without waiting
  // for the code state to flush.
  async function verifyCode(next?: string) {
    const token = (next ?? code).trim();
    if (verifying || token.length !== CODE_LENGTH) return;
    setError(null);
    setVerifying(true);
    const supabase = createClient();
    // Same email carries both the magic link and this 6-digit code — verifying
    // the code signs in directly on whatever origin the user is on, without
    // going through /auth/callback or the redirect-URL allowlist at all.
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      setVerifying(false);
      setError(error.message);
    } else {
      router.push("/");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-2">
        <Logo className="h-10 w-10" textClassName="text-3xl" />
      </h1>
      <p className="mb-8 text-ink/55">Sign in with a magic link or code sent to your email.</p>
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-stay/20 bg-stay/10 p-4 text-sm text-stay">
            Check your inbox — click the link, or enter the {CODE_LENGTH}-digit code below.
          </p>
          {/* Codes are exactly 6 digits (Supabase "Email OTP length", see SETUP.md).
              Entering the last digit auto-submits, so verifying is usually one paste. */}
          <CodeInput
            length={CODE_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={(c) => verifyCode(c)}
            disabled={verifying}
          />
          <button
            onClick={() => verifyCode()}
            disabled={verifying || code.trim().length !== CODE_LENGTH}
            className="btn-primary w-full"
          >
            {verifying && <Spinner className="h-4 w-4" />}
            {verifying ? "Verifying…" : "Verify code"}
          </button>
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
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

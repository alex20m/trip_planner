"use client";
import { useState } from "react";
import Spinner from "@/components/Spinner";
import { LogOutIcon } from "@/components/Icons";

// Signing out is a plain form POST that ends in a redirect to /login, so the
// page keeps sitting there — unchanged — for as long as the round trip takes.
// Without a pending state the click looks like it did nothing, so show one and
// swallow any further submits until the browser navigates away.
export default function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <form
      action="/auth/callback?signout=1"
      method="post"
      onSubmit={(e) => {
        // The button stays enabled on purpose: disabling a submit button from
        // its own submit handler can cancel the submission in some browsers.
        // Guarding here keeps double-clicks from firing a second POST.
        if (signingOut) {
          e.preventDefault();
          return;
        }
        setSigningOut(true);
      }}
    >
      <button
        type="submit"
        aria-busy={signingOut}
        className="flex items-center gap-1.5 text-sm text-ink/55 transition-colors hover:text-ink"
      >
        {signingOut ? <Spinner className="h-4 w-4" /> : <LogOutIcon className="h-4 w-4" />}
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}

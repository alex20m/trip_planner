"use client";
import { useState } from "react";
import type { TripRole } from "@/lib/types";
import { ROLE_RANK } from "@/lib/types";

export default function ShareModal({
  tripId,
  myRole,
  onClose
}: {
  tripId: string;
  myRole: TripRole;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"read" | "edit">("read");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // At most the same access you have yourself (owner counts as edit when sharing)
  const canGiveEdit = ROLE_RANK[myRole] >= ROLE_RANK.edit;

  async function invite() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, email, role })
    });
    const body = await res.json();
    setBusy(false);
    setStatus(res.ok ? "Invitation sent ✓" : body.error ?? "Something went wrong");
    if (res.ok) setEmail("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">Share trip</h2>
        <p className="mb-4 text-sm text-ink/60">
          The recipient gets an email and can accept or decline the invitation.
        </p>
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@epost.fi"
            className="w-full rounded-xl border border-ink/20 p-2.5 outline-none focus:border-activity"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRole("read")}
              className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-sm font-medium ${role === "read" ? "border-ink bg-ink/5" : "border-ink/10 text-ink/50"}`}
            >
              View
            </button>
            <button
              onClick={() => canGiveEdit && setRole("edit")}
              disabled={!canGiveEdit}
              className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-sm font-medium disabled:opacity-40 ${role === "edit" ? "border-ink bg-ink/5" : "border-ink/10 text-ink/50"}`}
            >
              Edit
            </button>
          </div>
          {!canGiveEdit && (
            <p className="text-xs text-ink/50">You have view access, so you can only share with view access.</p>
          )}
        </div>
        {status && <p className="mt-3 text-sm">{status}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-ink/20 px-4 py-2 text-sm font-medium">Close</button>
          <button onClick={invite} disabled={busy || !email}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50">
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

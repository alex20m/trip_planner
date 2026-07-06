"use client";
import { useState } from "react";
import type { TripRole } from "@/lib/types";
import { ROLE_RANK } from "@/lib/types";
import Spinner from "@/components/Spinner";

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Share trip</h2>
        <p className="mb-4 text-sm text-ink/55">
          The recipient gets an email and can accept or decline the invitation.
        </p>
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@epost.fi"
            className="field"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRole("read")}
              className={role === "read" ? "option border-ink bg-ink/5" : "option-off"}
            >
              View
            </button>
            <button
              onClick={() => canGiveEdit && setRole("edit")}
              disabled={!canGiveEdit}
              className={`disabled:opacity-40 ${role === "edit" ? "option border-ink bg-ink/5" : "option-off"}`}
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
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={invite} disabled={busy || !email} className="btn-primary">
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

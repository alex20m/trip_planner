"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/useOnline";

export default function NewTripForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const online = useOnline();

  async function create() {
    if (!name.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be signed in to create a trip.");
        return;
      }
      const { data, error } = await supabase
        .from("trips")
        .insert({ name: name.trim(), owner_id: user.id })
        .select("id")
        .single();
      if (error) setError(error.message);
      else if (data) router.push(`/trips/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && online && !busy && create()}
          placeholder="New trip, e.g. Rome 2026"
          disabled={!online || busy}
          className="flex-1 rounded-xl border border-ink/20 bg-surface p-3 outline-none focus:border-activity disabled:opacity-50"
        />
        <button
          onClick={create}
          disabled={!online || busy}
          title={online ? undefined : "Requires internet"}
          className="rounded-xl bg-charcoal px-5 font-medium text-white hover:bg-charcoal/90 disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {!online && <p className="mt-2 text-xs text-travel">Creating new trips requires an internet connection.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/useOnline";

export default function NewTripForm() {
  const [name, setName] = useState("");
  const router = useRouter();
  const online = useOnline();

  async function create() {
    if (!name.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("trips")
      .insert({ name: name.trim(), owner_id: user!.id })
      .select("id")
      .single();
    if (!error && data) router.push(`/trips/${data.id}`);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && online && create()}
          placeholder="New trip, e.g. Rome 2026"
          disabled={!online}
          className="flex-1 rounded-xl border border-ink/20 bg-white p-3 outline-none focus:border-activity disabled:opacity-50"
        />
        <button
          onClick={create}
          disabled={!online}
          title={online ? undefined : "Requires internet"}
          className="rounded-xl bg-ink px-5 font-medium text-white hover:bg-ink/90 disabled:opacity-40"
        >
          Create
        </button>
      </div>
      {!online && <p className="mt-2 text-xs text-travel">Creating new trips requires an internet connection.</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/useOnline";
import Spinner from "@/components/Spinner";

const today = () => format(new Date(), "yyyy-MM-dd");
const defaultEnd = () => format(addDays(new Date(), 6), "yyyy-MM-dd");

export default function NewTripForm() {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const online = useOnline();

  async function create() {
    if (!name.trim() || busy) return;
    setError(null);
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
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
        .insert({ name: name.trim(), owner_id: user.id, start_date: startDate, end_date: endDate })
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && online && !busy && create()}
          placeholder="New trip, e.g. Rome 2026"
          disabled={!online || busy}
          className="flex-1 rounded-xl border border-ink/20 bg-surface p-3 outline-none focus:border-activity disabled:opacity-50"
        />
        <label className="flex items-center gap-2 text-sm text-ink/60">
          Start
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={!online || busy}
            className="rounded-xl border border-ink/20 bg-surface p-3 outline-none focus:border-activity disabled:opacity-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/60">
          End
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={!online || busy}
            className="rounded-xl border border-ink/20 bg-surface p-3 outline-none focus:border-activity disabled:opacity-50"
          />
        </label>
        <button
          onClick={create}
          disabled={!online || busy}
          title={online ? undefined : "Requires internet"}
          className="flex items-center justify-center gap-2 rounded-xl bg-charcoal px-5 py-3 font-medium text-white hover:bg-charcoal/90 disabled:opacity-40 sm:py-0"
        >
          {busy && <Spinner className="h-4 w-4" />}
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {!online && <p className="mt-2 text-xs text-travel">Creating new trips requires an internet connection.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

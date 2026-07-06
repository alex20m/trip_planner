"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trip } from "@/lib/types";
import Spinner from "@/components/Spinner";

export default function EditTripDatesModal({
  trip,
  onClose,
  onSaved
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: (trip: Trip) => void;
}) {
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trips")
      .update({ start_date: startDate, end_date: endDate })
      .eq("id", trip.id)
      .select()
      .single();
    setSaving(false);
    if (error) setError(error.message);
    else {
      onSaved(data as Trip);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">Trip dates</h2>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-ink/60">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/20 p-2.5"
            />
          </label>
          <label className="text-sm text-ink/60">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/20 p-2.5"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="ml-auto rounded-xl border border-ink/20 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-medium text-white hover:bg-charcoal/90 disabled:opacity-50"
          >
            {saving && <Spinner className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

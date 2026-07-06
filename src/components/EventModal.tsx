"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";
import Spinner from "@/components/Spinner";

const toLocal = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

export default function EventModal({
  tripId,
  event,
  onClose,
  onSaved
}: {
  tripId: string;
  event: TripEvent | null;
  onClose: () => void;
  onSaved: (e: TripEvent, deleted?: boolean) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "activity");
  const [start, setStart] = useState(toLocal(event?.start_at ?? null));
  const [end, setEnd] = useState(toLocal(event?.end_at ?? null));
  const [startDate, setStartDate] = useState(event?.start_at?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(event?.end_at?.slice(0, 10) ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const isStay = type === "accommodation";

  async function save() {
    setError(null);
    // Accommodation is saved at UTC midnight so the calendar date is preserved exactly in the .ics export.
    const start_at = isStay ? (startDate ? `${startDate}T00:00:00Z` : "") : start;
    const end_at = isStay ? (endDate ? `${endDate}T00:00:00Z` : null) : end || null;
    if (!title.trim() || !start_at) {
      setError(isStay ? "Title and check-in date are required." : "Title and start time are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      trip_id: tripId,
      title: title.trim(),
      type,
      start_at: new Date(start_at).toISOString(),
      end_at: end_at ? new Date(end_at).toISOString() : null,
      location: location.trim() || null
    };
    const q = event
      ? supabase.from("trip_events").update(payload).eq("id", event.id).select().single()
      : supabase.from("trip_events").insert(payload).select().single();
    const { data, error } = await q;
    setSaving(false);
    if (error) setError(error.message);
    else {
      onSaved(data as TripEvent);
      onClose();
    }
  }

  async function remove() {
    if (!event) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("trip_events").delete().eq("id", event.id);
    setDeleting(false);
    if (error) setError(error.message);
    else {
      onSaved(event, true);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">{event ? "Edit event" : "New event"}</h2>

        <div className="mb-3 flex gap-2">
          {(Object.keys(EVENT_COLORS) as EventType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-sm font-medium ${
                type === t ? EVENT_COLORS[t].border + " " + EVENT_COLORS[t].bg : "border-ink/10 text-ink/50"
              }`}
            >
              {EVENT_COLORS[t].label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
            className="w-full rounded-xl border border-ink/20 p-2.5 outline-none focus:border-activity" />
          {isStay ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-ink/60">Check-in
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink/20 p-2.5" />
              </label>
              <label className="text-sm text-ink/60">Check-out (optional)
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink/20 p-2.5" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-ink/60">Start
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink/20 p-2.5" />
              </label>
              <label className="text-sm text-ink/60">End (optional)
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink/20 p-2.5" />
              </label>
            </div>
          )}
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)"
            className="w-full rounded-xl border border-ink/20 p-2.5 outline-none focus:border-activity" />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          {event && (
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting && <Spinner className="h-3.5 w-3.5" />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="ml-auto rounded-xl border border-ink/20 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
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

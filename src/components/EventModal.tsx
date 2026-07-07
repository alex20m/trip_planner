"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { BedIcon, CompassIcon, PlaneIcon } from "@/components/Icons";

const TYPE_ICONS: Record<EventType, typeof BedIcon> = {
  activity: CompassIcon,
  travel: PlaneIcon,
  accommodation: BedIcon
};

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
    const end_at = isStay ? (endDate ? `${endDate}T00:00:00Z` : "") : end || null;
    if (!title.trim() || !start_at || (isStay && !end_at)) {
      setError(isStay ? "Title, check-in date, and check-out date are required." : "Title and start time are required.");
      return;
    }
    if (isStay && end_at && end_at <= start_at) {
      setError("Check-out date must be after check-in date.");
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">{event ? "Edit event" : "New event"}</h2>

        <div className="mb-3 flex gap-2">
          {(Object.keys(EVENT_COLORS) as EventType[]).map((t) => {
            const Icon = TYPE_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  type === t
                    ? `option flex items-center justify-center gap-1.5 ${EVENT_COLORS[t].border} ${EVENT_COLORS[t].bg}`
                    : "option-off flex items-center justify-center gap-1.5"
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {EVENT_COLORS[t].label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field" />
          {isStay ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="label">Check-in
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="field mt-1" />
              </label>
              <label className="label">Check-out
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="field mt-1" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="label">Start
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                  className="field mt-1" />
              </label>
              <label className="label">End (optional)
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="field mt-1" />
              </label>
            </div>
          )}
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="field" />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          {event && (
            <button onClick={remove} disabled={busy} className="btn-danger">
              {deleting && <Spinner className="h-3.5 w-3.5" />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button onClick={onClose} disabled={busy} className="btn-secondary ml-auto">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            {saving && <Spinner className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

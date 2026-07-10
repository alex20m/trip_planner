"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";
import Spinner from "@/components/Spinner";
import LocationAutocomplete from "@/components/LocationAutocomplete";
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
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(toLocal(event?.start_at ?? null));
  const [end, setEnd] = useState(toLocal(event?.end_at ?? null));
  const [startDate, setStartDate] = useState(event?.start_at?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(event?.end_at?.slice(0, 10) ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    event && event.location_lat != null && event.location_lng != null
      ? { lat: event.location_lat, lng: event.location_lng }
      : null
  );
  // Locations must be picked from the geocoder suggestions, not typed freely.
  // The stored location of an existing event counts as already confirmed.
  const [locationConfirmed, setLocationConfirmed] = useState(true);
  // Travel legs also have an end destination, kept in its own field so
  // switching the type back and forth doesn't clobber the start location.
  const [endLocation, setEndLocation] = useState(event?.end_location ?? "");
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(
    event && event.end_location_lat != null && event.end_location_lng != null
      ? { lat: event.end_location_lat, lng: event.end_location_lng }
      : null
  );
  const [endLocationConfirmed, setEndLocationConfirmed] = useState(true);
  const [description, setDescription] = useState(event?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const isStay = type === "accommodation";
  const isTravel = type === "travel";
  const isAllDay = isStay || allDay;

  async function save() {
    setError(null);
    // All-day events (including accommodation) are saved at UTC midnight so the calendar date is preserved exactly in the .ics export.
    const start_at = isAllDay ? (startDate ? `${startDate}T00:00:00Z` : "") : start;
    const end_at = isAllDay ? (endDate ? `${endDate}T00:00:00Z` : "") : end || null;
    if (!title.trim() || !start_at || (isStay && !end_at)) {
      setError(isStay ? "Title, check-in date, and check-out date are required." : "Title and start time are required.");
      return;
    }
    if (isAllDay && end_at && end_at <= start_at) {
      setError(isStay ? "Check-out date must be after check-in date." : "End date must be after start date.");
      return;
    }
    if (isTravel && (!location.trim() || !endLocation.trim())) {
      setError("Travel needs both a start and an end destination.");
      return;
    }
    if ((location.trim() && !locationConfirmed) || (isTravel && endLocation.trim() && !endLocationConfirmed)) {
      setError("Choose a location from the suggestions — only real places can be used.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      trip_id: tripId,
      title: title.trim(),
      type,
      all_day: isAllDay,
      start_at: new Date(start_at).toISOString(),
      end_at: end_at ? new Date(end_at).toISOString() : null,
      location: location.trim() || null,
      location_lat: location.trim() ? (coords?.lat ?? null) : null,
      location_lng: location.trim() ? (coords?.lng ?? null) : null,
      end_location: isTravel && endLocation.trim() ? endLocation.trim() : null,
      end_location_lat: isTravel && endLocation.trim() ? (endCoords?.lat ?? null) : null,
      end_location_lng: isTravel && endLocation.trim() ? (endCoords?.lng ?? null) : null,
      description: description.trim() || null
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
          {!isStay && (
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllDay(checked);
                  if (checked) {
                    if (!startDate && start) setStartDate(start.slice(0, 10));
                    if (!endDate && end) setEndDate(end.slice(0, 10));
                  } else {
                    if (!start && startDate) setStart(`${startDate}T00:00`);
                    if (!end && endDate) setEnd(`${endDate}T00:00`);
                  }
                }}
                className="h-4 w-4 rounded border-ink/30"
              />
              All day
            </label>
          )}
          {isAllDay ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="date-field">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  placeholder={isStay ? "Check-in" : "Date"} className={`field${startDate ? " has-value" : ""}`} />
                {!startDate && <span className="date-placeholder">{isStay ? "Check-in" : "Date"}</span>}
              </div>
              <div className="date-field">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  placeholder={isStay ? "Check-out" : "End date (optional)"} className={`field${endDate ? " has-value" : ""}`} />
                {!endDate && <span className="date-placeholder">{isStay ? "Check-out" : "End date (optional)"}</span>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="date-field">
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                  placeholder="Start" className={`field${start ? " has-value" : ""}`} />
                {!start && <span className="date-placeholder">Start</span>}
              </div>
              <div className="date-field">
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                  placeholder="End (optional)" className={`field${end ? " has-value" : ""}`} />
                {!end && <span className="date-placeholder">End (optional)</span>}
              </div>
            </div>
          )}
          {/* Every event location is city-level — "Helsinki, Finland" — so
              trips, activities, and stays all label places the same way. */}
          <LocationAutocomplete
            value={location}
            placeholder={isTravel ? "From" : undefined}
            cityLevel
            onChange={(text) => {
              setLocation(text);
              setCoords(null);
              // Typed text is unconfirmed until picked; clearing the field is fine.
              setLocationConfirmed(text.trim() === "");
            }}
            onSelect={(place) => {
              setLocation(place.name);
              setCoords({ lat: place.lat, lng: place.lng });
              setLocationConfirmed(true);
            }}
          />
          {isTravel && (
            <LocationAutocomplete
              value={endLocation}
              placeholder="To"
              cityLevel
              onChange={(text) => {
                setEndLocation(text);
                setEndCoords(null);
                setEndLocationConfirmed(text.trim() === "");
              }}
              onSelect={(place) => {
                setEndLocation(place.name);
                setEndCoords({ lat: place.lat, lng: place.lng });
                setEndLocationConfirmed(true);
              }}
            />
          )}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            className="field resize-y"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {event && !saving && (
            <button onClick={remove} disabled={busy} className="btn-danger">
              {deleting && <Spinner className="h-3.5 w-3.5" />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {!busy && (
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
            )}
            {!deleting && (
              <button onClick={save} disabled={busy} className="btn-primary">
                {saving && <Spinner className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

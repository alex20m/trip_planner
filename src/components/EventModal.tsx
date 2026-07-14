"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addDays, addHours, format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS, parseDateOnly } from "@/lib/types";
import Spinner from "@/components/Spinner";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { reverseGeocode, searchPlaces } from "@/lib/geocode";
import { BedIcon, CompassIcon, PlaneIcon } from "@/components/Icons";

// Leaflet only runs in the browser, so the location preview must skip SSR.
const LocationPreviewMap = dynamic(() => import("@/components/map/LocationPreviewMap"), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-2xl bg-ink/5" />
});

const TYPE_ICONS: Record<EventType, typeof BedIcon> = {
  activity: CompassIcon,
  travel: PlaneIcon,
  accommodation: BedIcon
};

const toLocal = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

// Opening an empty end field prefills it from the start, so the picker starts
// from a sensible value instead of "now": an hour later for timed events, the
// next day for date-only ones (stay check-out, all-day end date).
const hourAfter = (local: string) => format(addHours(new Date(local), 1), "yyyy-MM-dd'T'HH:mm");
const dayAfter = (date: string) => format(addDays(parseDateOnly(date), 1), "yyyy-MM-dd");

// A native date/time picker opens at the input's current value; an empty field
// opens at "now". Setting the value in onFocus is too late for a mouse click —
// the picker has already opened empty, and the browser then reverts our value
// back to match it (the "flash then jump to now" bug). So we seed the DOM value
// on mousedown, before the click opens the picker, and mirror it into state.
// onFocus covers keyboard users, where no picker auto-opens to fight.
const seedEnd = (
  el: HTMLInputElement | null,
  compute: () => string,
  set: (v: string) => void
) => {
  if (!el || el.value) return;
  const v = compute();
  el.value = v;
  set(v);
};

// Best-effort coordinates for a freely typed location. Locations no longer have
// to be picked from the suggestions, so on save we geocode whatever text the
// user entered to give the event a map pin. The geocoder pins buildings, not
// apartments, so "Itämerenkatu 35B 39" resolves to the building — the exact
// text is still what we store; this only supplies the pin. Returns null (no
// pin) when nothing matches or the geocoder is unreachable, which is fine: an
// event can have a location without a map pin.
async function resolveCoords(text: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [best] = await searchPlaces(text);
    return best ? { lat: best.lat, lng: best.lng } : null;
  } catch {
    return null;
  }
}

export default function EventModal({
  tripId,
  event,
  defaultStart,
  tripStart,
  tripEnd,
  onClose,
  onSaved
}: {
  tripId: string;
  event: TripEvent | null;
  // Prefill for a new event, as a local "yyyy-MM-ddTHH:mm" — set when the
  // modal was opened by pressing a day in the calendar. Ignored when editing.
  defaultStart?: string | null;
  // Trip bounds as "yyyy-MM-dd"; when set, an event's dates must fall inside
  // them so events can't be placed outside the trip they belong to.
  tripStart?: string;
  tripEnd?: string;
  onClose: () => void;
  // `e` is null when a write succeeds but the row isn't returned (Supabase
  // gives back { data: null } when the insert/update representation comes back
  // empty — e.g. for non-owner editors on a shared trip). The parent reloads
  // in that case instead of trying to render a missing event.
  onSaved: (e: TripEvent | null, deleted?: boolean) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "activity");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(event ? toLocal(event.start_at) : (defaultStart ?? ""));
  const [end, setEnd] = useState(toLocal(event?.end_at ?? null));
  const [startDate, setStartDate] = useState(event?.start_at?.slice(0, 10) ?? defaultStart?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(event?.end_at?.slice(0, 10) ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    event && event.location_lat != null && event.location_lng != null
      ? { lat: event.location_lat, lng: event.location_lng }
      : null
  );
  // Travel legs also have an end destination, kept in its own field so
  // switching the type back and forth doesn't clobber the start location.
  const [endLocation, setEndLocation] = useState(event?.end_location ?? "");
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(
    event && event.end_location_lat != null && event.end_location_lng != null
      ? { lat: event.end_location_lat, lng: event.end_location_lng }
      : null
  );
  // Which field a map-dropped pin fills. Only travel has two locations to
  // choose between; every other type always fills the single location.
  const [pinTarget, setPinTarget] = useState<"start" | "end">("start");
  // A pin was just dropped and we're naming it from its coordinates.
  const [locating, setLocating] = useState(false);
  const [description, setDescription] = useState(event?.description ?? "");
  // Refs let us seed the end pickers imperatively before they open (see seedEnd).
  const endRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const isStay = type === "accommodation";
  const isTravel = type === "travel";
  const isAllDay = isStay || allDay;

  // Only places with coordinates get a pin — coordinates are cleared as soon as
  // the user types over a picked place, so the preview never shows a stale pin.
  // Freely typed text has no coordinates until it's geocoded on save, so it
  // shows no pin here; that's expected.
  const previewPoints = useMemo(() => {
    const points: { lat: number; lng: number; label: string }[] = [];
    if (coords) points.push({ ...coords, label: isTravel ? `From: ${location}` : location });
    if (isTravel && endCoords) points.push({ ...endCoords, label: `To: ${endLocation}` });
    return points;
  }, [coords, endCoords, isTravel, location, endLocation]);

  // Dropping a pin on the map is an alternative to typing: the click gives us
  // real coordinates straight away (so the location counts as confirmed), and
  // we reverse-geocode them into a readable city name. Travel picks the field
  // named by the From/To toggle; every other type fills its single location.
  async function handlePinDrop(lat: number, lng: number) {
    const target = isTravel ? pinTarget : "start";
    const setName = target === "start" ? setLocation : setEndLocation;
    const setPoint = target === "start" ? setCoords : setEndCoords;
    setPoint({ lat, lng });
    // Show the coordinates until the name resolves, so the field is never empty
    // and there's a sensible label if reverse geocoding fails or is offline.
    const coordLabel = `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    setName(coordLabel);
    setLocating(true);
    try {
      const place = await reverseGeocode(lat, lng);
      if (place) {
        setName(place.name);
        setPoint({ lat: place.lat, lng: place.lng });
      }
    } catch {
      // Keep the coordinate label — the pin is still a valid, confirmed place.
    } finally {
      setLocating(false);
    }
  }

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
    // Keep every date the event touches inside the trip's own range — ISO
    // "yyyy-MM-dd" strings compare correctly, so slice the day off each field.
    if (tripStart && tripEnd) {
      const startDay = isAllDay ? startDate : start.slice(0, 10);
      const endDay = isAllDay ? endDate : end ? end.slice(0, 10) : "";
      const outOfRange = (d: string) => !!d && (d < tripStart || d > tripEnd);
      if (outOfRange(startDay) || outOfRange(endDay)) {
        setError(
          `Event dates must be within the trip (${format(parseDateOnly(tripStart), "MMM d")} – ${format(
            parseDateOnly(tripEnd),
            "MMM d, yyyy"
          )}).`
        );
        return;
      }
    }
    if (isTravel && (!location.trim() || !endLocation.trim())) {
      setError("Travel needs both a start and an end destination.");
      return;
    }
    setSaving(true);
    // A location can be typed freely instead of picked, so fill in a map pin for
    // any text that doesn't already have coordinates (from a picked suggestion
    // or a dropped pin). resolveCoords keeps the typed text untouched.
    let startPoint = coords;
    let endPoint = endCoords;
    if (location.trim() && !startPoint) startPoint = await resolveCoords(location);
    if (isTravel && endLocation.trim() && !endPoint) endPoint = await resolveCoords(endLocation);
    const supabase = createClient();
    const payload = {
      trip_id: tripId,
      title: title.trim(),
      type,
      all_day: isAllDay,
      start_at: new Date(start_at).toISOString(),
      end_at: end_at ? new Date(end_at).toISOString() : null,
      location: location.trim() || null,
      location_lat: location.trim() ? (startPoint?.lat ?? null) : null,
      location_lng: location.trim() ? (startPoint?.lng ?? null) : null,
      end_location: isTravel && endLocation.trim() ? endLocation.trim() : null,
      end_location_lat: isTravel && endLocation.trim() ? (endPoint?.lat ?? null) : null,
      end_location_lng: isTravel && endLocation.trim() ? (endPoint?.lng ?? null) : null,
      description: description.trim() || null
    };
    const q = event
      ? supabase.from("trip_events").update(payload).eq("id", event.id).select().single()
      : supabase.from("trip_events").insert(payload).select().single();
    const { data, error } = await q;
    setSaving(false);
    if (error) setError(error.message);
    else {
      // `data` may be null even on success (empty RETURNING representation);
      // hand it up as-is so the parent can reload rather than crash on a
      // missing event.
      onSaved((data as TripEvent | null) ?? null);
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
                <input ref={endDateRef} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  onMouseDown={() => startDate && seedEnd(endDateRef.current, () => dayAfter(startDate), setEndDate)}
                  onFocus={() => startDate && seedEnd(endDateRef.current, () => dayAfter(startDate), setEndDate)}
                  placeholder={isStay ? "Check-out" : "End date (optional)"} className={`field${endDate ? " has-value" : ""}`} />
                {!endDate && <span className="date-placeholder">{isStay ? "Check-out" : "End date (optional)"}</span>}
                {/* The end date is optional for non-stays, and native date inputs
                    are awkward to clear (no reset on mobile), so offer an explicit
                    reset for one picked by mistake. */}
                {endDate && !isStay && (
                  <button type="button" onClick={() => setEndDate("")}
                    aria-label="Clear end date" className="field-clear">
                    Clear
                  </button>
                )}
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
                <input ref={endRef} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                  onMouseDown={() => start && seedEnd(endRef.current, () => hourAfter(start), setEnd)}
                  onFocus={() => start && seedEnd(endRef.current, () => hourAfter(start), setEnd)}
                  placeholder="End (optional)" className={`field${end ? " has-value" : ""}`} />
                {!end && <span className="date-placeholder">End (optional)</span>}
                {/* The end time is always optional, and native pickers are awkward
                    to clear, so offer an explicit reset for one set by mistake. */}
                {end && (
                  <button type="button" onClick={() => setEnd("")}
                    aria-label="Clear end time" className="field-clear">
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Pick a suggestion for an instant map pin, or just type any address
              — down to a stair and apartment like "Itämerenkatu 35B 39". Typed
              text is kept verbatim and geocoded for a pin on save (see save()).
              Picking a suggestion still sets coordinates straight away so the
              preview updates as you go. */}
          <LocationAutocomplete
            value={location}
            placeholder={isTravel ? "From" : undefined}
            onChange={(text) => {
              setLocation(text);
              // Drop any pin from a previous pick — the text no longer matches it.
              setCoords(null);
            }}
            onSelect={(place) => {
              setLocation(place.name);
              setCoords({ lat: place.lat, lng: place.lng });
            }}
          />
          {isTravel && (
            <LocationAutocomplete
              value={endLocation}
              placeholder="To"
              onChange={(text) => {
                setEndLocation(text);
                setEndCoords(null);
              }}
              onSelect={(place) => {
                setEndLocation(place.name);
                setEndCoords({ lat: place.lat, lng: place.lng });
              }}
            />
          )}
          <div>
            {isTravel && (
              <div className="mb-1.5 flex items-center gap-2 text-xs text-ink/60">
                <span>Drop pin on:</span>
                <div className="flex gap-1">
                  {(["start", "end"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPinTarget(t)}
                      aria-pressed={pinTarget === t}
                      className={`rounded-lg px-2 py-0.5 ${
                        pinTarget === t ? "bg-ink/10 text-ink" : "text-ink/60 hover:bg-ink/5"
                      }`}
                    >
                      {t === "start" ? "From" : "To"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <LocationPreviewMap points={previewPoints} onPick={handlePinDrop} />
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink/50">
              {locating && <Spinner className="h-3 w-3" />}
              {locating
                ? "Finding the place you pinned…"
                : "Search or type an address above, or click the map to drop a pin — this is where the event will appear on the trip map."}
            </p>
          </div>
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

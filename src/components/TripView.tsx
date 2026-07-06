"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import type { NoteSection, Trip, TripEvent, TripRole } from "@/lib/types";
import { canEdit, parseDateOnly, EVENT_COLORS } from "@/lib/types";
import { useOnline } from "@/hooks/useOnline";
import { createClient } from "@/lib/supabase/client";
import { idbGet, idbSet, tripSnapshotKey, type TripSnapshot } from "@/lib/offlineStore";
import WeekView from "@/components/calendar/WeekView";
import EventModal from "@/components/EventModal";
import ShareModal from "@/components/ShareModal";
import CalendarSyncModal from "@/components/CalendarSyncModal";
import EditTripDatesModal from "@/components/EditTripDatesModal";
import OfflineBanner from "@/components/OfflineBanner";
import NotesPanel from "@/components/notes/NotesPanel";

export default function TripView({
  trip: initialTrip,
  role,
  initialEvents,
  initialSections
}: {
  trip: Trip;
  role: TripRole;
  initialEvents: TripEvent[];
  initialSections: NoteSection[];
}) {
  const online = useOnline();
  const router = useRouter();
  const [trip, setTrip] = useState(initialTrip);
  const [events, setEvents] = useState(initialEvents);
  const [sections, setSections] = useState(initialSections);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const tripStart = useMemo(() => parseDateOnly(trip.start_date), [trip.start_date]);
  const tripEnd = useMemo(() => parseDateOnly(trip.end_date), [trip.end_date]);
  const firstWeek = useMemo(() => startOfWeek(tripStart, { weekStartsOn: 1 }), [tripStart]);
  const lastWeek = useMemo(() => startOfWeek(tripEnd, { weekStartsOn: 1 }), [tripEnd]);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(parseDateOnly(initialTrip.start_date), { weekStartsOn: 1 })
  );
  const [editing, setEditing] = useState<TripEvent | "new" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingDates, setEditingDates] = useState(false);

  // Editing and sharing require a connection; offline is always read-only.
  const editable = canEdit(role) && online;

  const weekLabel = useMemo(
    () =>
      `${format(weekStart, "d MMM", { locale: enUS })} – ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: enUS })}`,
    [weekStart]
  );

  const tripDateLabel = useMemo(
    () => `${format(tripStart, "d MMM", { locale: enUS })} – ${format(tripEnd, "d MMM yyyy", { locale: enUS })}`,
    [tripStart, tripEnd]
  );

  // Keep the visible week inside the trip's date range, e.g. after the dates are edited.
  useEffect(() => {
    setWeekStart((w) => (w < firstWeek ? firstWeek : w > lastWeek ? lastWeek : w));
  }, [firstWeek, lastWeek]);

  // While online: save a fresh snapshot to IndexedDB after every change.
  // While offline: load the last known snapshot if the server gave us nothing.
  useEffect(() => {
    const key = tripSnapshotKey(trip.id);
    if (online) {
      const snapshot: TripSnapshot = {
        trip: { id: trip.id, name: trip.name },
        role,
        events,
        sections,
        savedAt: Date.now()
      };
      idbSet(key, snapshot).then(() => setSavedAt(snapshot.savedAt));
    } else {
      idbGet<TripSnapshot>(key).then((snap) => {
        if (snap) {
          setEvents(snap.events as TripEvent[]);
          setSections(snap.sections as NoteSection[]);
          setSavedAt(snap.savedAt);
        }
      });
    }
    // Runs when trip id or online status changes, not on every small state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, online]);

  // Also save continuously as events/sections change while online.
  useEffect(() => {
    if (!online) return;
    const key = tripSnapshotKey(trip.id);
    const snapshot: TripSnapshot = { trip: { id: trip.id, name: trip.name }, role, events, sections, savedAt: Date.now() };
    idbSet(key, snapshot).then(() => setSavedAt(snapshot.savedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, sections]);

  async function deleteTrip() {
    if (!confirm(`Delete "${trip.name}"? This removes its events, notes, and sharing for everyone. This cannot be undone.`)) {
      return;
    }
    setDeletingTrip(true);
    const supabase = createClient();
    const { error } = await supabase.from("trips").delete().eq("id", trip.id);
    if (error) {
      setDeletingTrip(false);
      alert(error.message);
      return;
    }
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-5xl p-4 pb-32 sm:p-6 sm:pb-24">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/" className="text-ink/50 hover:text-ink" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{trip.name}</h1>
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs uppercase tracking-wide text-ink/60">
          {role === "owner" ? "owner" : role === "edit" ? "edit" : "view"}
        </span>
        {role === "owner" ? (
          <button
            onClick={() => online && setEditingDates(true)}
            disabled={!online}
            title={online ? "Edit trip dates" : "Requires internet"}
            className="rounded-lg border border-ink/20 bg-surface px-2 py-1 text-xs font-medium text-ink/60 hover:border-ink/40 disabled:opacity-40"
          >
            {tripDateLabel} ✎
          </button>
        ) : (
          <span className="text-xs text-ink/50">{tripDateLabel}</span>
        )}
        <div className="ml-auto flex gap-2">
          {trip.calendar_token && (
            <button
              onClick={() => setSyncing(true)}
              className="rounded-lg border border-ink/20 bg-surface px-3 py-1.5 text-sm font-medium hover:border-ink/40"
            >
              Sync calendar
            </button>
          )}
          <button
            onClick={() => online && setSharing(true)}
            disabled={!online}
            title={online ? undefined : "Requires internet"}
            className="rounded-lg border border-ink/20 bg-surface px-3 py-1.5 text-sm font-medium hover:border-ink/40 disabled:opacity-40"
          >
            Share
          </button>
          {canEdit(role) && (
            <button
              onClick={() => editable && setEditing("new")}
              disabled={!editable}
              title={editable ? undefined : "Requires internet"}
              className="rounded-lg bg-charcoal px-3 py-1.5 text-sm font-medium text-white hover:bg-charcoal/90 disabled:opacity-40"
            >
              + Event
            </button>
          )}
          {role === "owner" && (
            <button
              onClick={() => online && !deletingTrip && deleteTrip()}
              disabled={!online || deletingTrip}
              title={online ? undefined : "Requires internet"}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              {deletingTrip ? "Deleting…" : "Delete trip"}
            </button>
          )}
        </div>
      </header>

      <OfflineBanner savedAt={savedAt} />

      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => weekStart > firstWeek && setWeekStart(addDays(weekStart, -7))}
          disabled={weekStart <= firstWeek}
          className="rounded-lg border border-ink/20 bg-surface px-2 py-1 hover:border-ink/40 disabled:opacity-40"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="min-w-40 text-sm font-medium">{weekLabel}</span>
        <button
          onClick={() => weekStart < lastWeek && setWeekStart(addDays(weekStart, 7))}
          disabled={weekStart >= lastWeek}
          className="rounded-lg border border-ink/20 bg-surface px-2 py-1 hover:border-ink/40 disabled:opacity-40"
          aria-label="Next week"
        >
          ›
        </button>
        <div className="ml-auto hidden gap-3 text-xs sm:flex">
          {(Object.keys(EVENT_COLORS) as (keyof typeof EVENT_COLORS)[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <i className={`h-2.5 w-2.5 rounded-full border-2 ${EVENT_COLORS[t].border} ${EVENT_COLORS[t].bg}`} />
              {EVENT_COLORS[t].label}
            </span>
          ))}
        </div>
      </div>

      <WeekView
        weekStart={weekStart}
        events={events}
        rangeStart={tripStart}
        rangeEnd={tripEnd}
        onSelect={(e) => (editable ? setEditing(e) : undefined)}
      />

      <NotesPanel tripId={trip.id} sections={sections} setSections={setSections} editable={editable} />

      {editing && (
        <EventModal
          tripId={trip.id}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(e, deleted) =>
            setEvents((prev) =>
              deleted
                ? prev.filter((x) => x.id !== e.id)
                : prev.some((x) => x.id === e.id)
                  ? prev.map((x) => (x.id === e.id ? e : x))
                  : [...prev, e]
            )
          }
        />
      )}
      {sharing && <ShareModal tripId={trip.id} myRole={role} onClose={() => setSharing(false)} />}
      {syncing && trip.calendar_token && (
        <CalendarSyncModal tripId={trip.id} token={trip.calendar_token} onClose={() => setSyncing(false)} />
      )}
      {editingDates && (
        <EditTripDatesModal trip={trip} onClose={() => setEditingDates(false)} onSaved={(updated) => setTrip(updated)} />
      )}
    </main>
  );
}

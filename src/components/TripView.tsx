"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import type { NoteSection, Trip, TripEvent, TripRole } from "@/lib/types";
import { canEdit, parseDateOnly, EVENT_COLORS } from "@/lib/types";
import { useOnline } from "@/hooks/useOnline";
import { createClient } from "@/lib/supabase/client";
import { getLastSynced, idbGet, idbSet, setLastSynced, tripSnapshotKey, type TripSnapshot } from "@/lib/offlineStore";
import { markTripDeleted, unmarkTripDeleted } from "@/lib/optimistic";
import WeekView from "@/components/calendar/WeekView";
import EventModal from "@/components/EventModal";
import EventDetail from "@/components/EventDetail";
import ShareModal from "@/components/ShareModal";
import CalendarSyncModal from "@/components/CalendarSyncModal";
import EditTripDatesModal from "@/components/EditTripDatesModal";
import OfflineBanner from "@/components/OfflineBanner";
import NotesPanel from "@/components/notes/NotesPanel";
import { ChevronLeftIcon, ChevronRightIcon, MoreIcon, PencilIcon, PlusIcon, RefreshIcon, ShareIcon, TrashIcon } from "@/components/Icons";

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
  const [tab, setTab] = useState<"calendar" | "notes">("calendar");
  const [menuOpen, setMenuOpen] = useState(false);
  const tripStart = useMemo(() => parseDateOnly(trip.start_date), [trip.start_date]);
  const tripEnd = useMemo(() => parseDateOnly(trip.end_date), [trip.end_date]);
  const firstWeek = useMemo(() => startOfWeek(tripStart, { weekStartsOn: 1 }), [tripStart]);
  const lastWeek = useMemo(() => startOfWeek(tripEnd, { weekStartsOn: 1 }), [tripEnd]);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(parseDateOnly(initialTrip.start_date), { weekStartsOn: 1 })
  );
  const [editing, setEditing] = useState<TripEvent | "new" | null>(null);
  const [viewing, setViewing] = useState<TripEvent | null>(null);
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
  // `online` starts as true for the first render pass even when the device is
  // offline (useOnline can't read navigator.onLine until after mount), so a
  // cached page opened in flight mode would otherwise overwrite the last good
  // snapshot with its stale server-rendered props — and a fresh timestamp.
  // Re-checking navigator.onLine at write time closes that window.
  useEffect(() => {
    const key = tripSnapshotKey(trip.id);
    if (online && navigator.onLine) {
      const now = Date.now();
      const snapshot: TripSnapshot = {
        trip: { id: trip.id, name: trip.name },
        role,
        events,
        sections,
        savedAt: now
      };
      idbSet(key, snapshot);
      setLastSynced(now).then(setSavedAt);
    } else if (!online) {
      idbGet<TripSnapshot>(key).then((snap) => {
        if (snap) {
          setEvents(snap.events as TripEvent[]);
          setSections(snap.sections as NoteSection[]);
          getLastSynced().then((ts) => setSavedAt(ts ?? snap.savedAt));
        }
      });
    }
    // Runs when trip id or online status changes, not on every small state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, online]);

  // Also save continuously as events/sections change while online.
  useEffect(() => {
    if (!online || !navigator.onLine) return;
    const key = tripSnapshotKey(trip.id);
    const now = Date.now();
    const snapshot: TripSnapshot = { trip: { id: trip.id, name: trip.name }, role, events, sections, savedAt: now };
    idbSet(key, snapshot);
    setLastSynced(now).then(setSavedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, sections]);

  function deleteTrip() {
    if (!confirm(`Delete "${trip.name}"? This removes its events, notes, and sharing for everyone. This cannot be undone.`)) {
      return;
    }
    setDeletingTrip(true);
    // Optimistic: hide the trip and navigate home immediately, then delete in
    // the background. TripList reads this marker so the trip doesn't reappear
    // while the server catches up.
    markTripDeleted(trip.id);
    const supabase = createClient();
    supabase
      .from("trips")
      .delete()
      .eq("id", trip.id)
      .then(({ error }) => {
        if (error) {
          // Roll back the optimistic hide and let the user know it failed.
          unmarkTripDeleted(trip.id);
          alert(`Couldn't delete "${trip.name}": ${error.message}`);
          router.refresh();
        }
      });
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 pb-32 sm:px-6 sm:py-8 sm:pb-24">
      <header className="mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/" className="btn-ghost btn-icon -ml-2 shrink-0" aria-label="Back to trips">
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{trip.name}</h1>
          <span className="chip shrink-0">{role === "owner" ? "Owner" : role === "edit" ? "Can edit" : "View only"}</span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {canEdit(role) ? (
            <button
              onClick={() => online && setEditingDates(true)}
              disabled={!online}
              title={online ? "Edit trip dates" : "Requires internet"}
              className="chip gap-1.5 transition-colors hover:bg-ink/10 disabled:opacity-40"
            >
              {tripDateLabel}
              <PencilIcon className="h-3 w-3" />
            </button>
          ) : (
            <span className="chip">{tripDateLabel}</span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {canEdit(role) && (
              <button
                onClick={() => editable && setEditing("new")}
                disabled={!editable}
                title={editable ? "Add event" : "Requires internet"}
                aria-label="Add event"
                className="btn-primary btn-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span>
                  Add<span className="hidden sm:inline"> event</span>
                </span>
              </button>
            )}
            {/* Sharing and calendar sync are open to every member (viewers
                included); deleting the trip stays owner-only. */}
            <TripMenu
              online={online}
              hasSyncLink={!!trip.calendar_token}
              canDelete={role === "owner"}
              deleting={deletingTrip}
              open={menuOpen}
              setOpen={setMenuOpen}
              onShare={() => setSharing(true)}
              onSync={() => setSyncing(true)}
              onDelete={deleteTrip}
            />
          </div>
        </div>
      </header>

      <OfflineBanner savedAt={savedAt} />

      <div
        role="tablist"
        aria-label="Trip sections"
        className="mb-4 inline-flex rounded-full border border-ink/10 bg-surface p-1 shadow-soft"
      >
        <button
          role="tab"
          aria-selected={tab === "calendar"}
          onClick={() => setTab("calendar")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
            tab === "calendar" ? "bg-charcoal text-white" : "text-ink/55 hover:text-ink"
          }`}
        >
          Calendar
        </button>
        <button
          role="tab"
          aria-selected={tab === "notes"}
          onClick={() => setTab("notes")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
            tab === "notes" ? "bg-charcoal text-white" : "text-ink/55 hover:text-ink"
          }`}
        >
          Notes{sections.length > 0 ? ` (${sections.length})` : ""}
        </button>
      </div>

      {tab === "calendar" ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 sm:justify-start">
            <button
              onClick={() => weekStart > firstWeek && setWeekStart(addDays(weekStart, -7))}
              disabled={weekStart <= firstWeek}
              className="btn-secondary btn-icon"
              aria-label="Previous week"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="min-w-40 text-center text-sm font-medium text-ink/80 sm:text-left">{weekLabel}</span>
            <button
              onClick={() => weekStart < lastWeek && setWeekStart(addDays(weekStart, 7))}
              disabled={weekStart >= lastWeek}
              className="btn-secondary btn-icon"
              aria-label="Next week"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <div className="ml-auto hidden gap-3 text-xs text-ink/60 sm:flex">
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
            onSelect={(e) => setViewing(e)}
          />
        </>
      ) : (
        <NotesPanel tripId={trip.id} sections={sections} setSections={setSections} editable={editable} />
      )}

      {viewing && (
        <EventDetail
          event={viewing}
          canEdit={editable}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
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

function TripMenu({
  online,
  hasSyncLink,
  canDelete,
  deleting,
  open,
  setOpen,
  onShare,
  onSync,
  onDelete
}: {
  online: boolean;
  hasSyncLink: boolean;
  canDelete: boolean;
  deleting: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  onShare: () => void;
  onSync: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-secondary btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More trip options"
      >
        <MoreIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-surface p-1.5 shadow-panel"
        >
          <button
            role="menuitem"
            onClick={() => {
              if (!online) return;
              setOpen(false);
              onShare();
            }}
            disabled={!online}
            title={online ? undefined : "Requires internet"}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-40"
          >
            <ShareIcon className="h-4 w-4 text-ink/50" />
            Share trip
          </button>
          {hasSyncLink && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSync();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-ink/5"
            >
              <RefreshIcon className="h-4 w-4 text-ink/50" />
              Sync calendar
            </button>
          )}
          {canDelete && (
            <button
              role="menuitem"
              onClick={() => {
                if (online && !deleting) {
                  setOpen(false);
                  onDelete();
                }
              }}
              disabled={!online || deleting}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
            >
              <TrashIcon className="h-4 w-4" />
              {deleting ? "Deleting…" : "Delete trip"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

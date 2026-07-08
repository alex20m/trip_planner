"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { useOnline } from "@/hooks/useOnline";
import { createClient } from "@/lib/supabase/client";
import { idbGet, idbSet, prefetchAllTrips } from "@/lib/offlineStore";
import { reconcileDeletedTrips } from "@/lib/optimistic";
import { parseDateOnly } from "@/lib/types";
import OfflineBanner from "@/components/OfflineBanner";
import Spinner from "@/components/Spinner";
import { ChevronRightIcon } from "@/components/Icons";

type TripStub = { id: string; name: string; start_date?: string; end_date?: string; created_at: string };

const KEY = "trips-list";

function dateRange(startDate: string, endDate: string) {
  return `${format(parseDateOnly(startDate), "d MMM", { locale: enUS })} – ${format(parseDateOnly(endDate), "d MMM yyyy", { locale: enUS })}`;
}

export default function TripList({ initialTrips }: { initialTrips: TripStub[] }) {
  const online = useOnline();
  const [trips, setTrips] = useState(initialTrips);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [caching, setCaching] = useState(false);

  useEffect(() => {
    if (online) {
      // Hide trips the user just deleted optimistically until the server list
      // stops returning them (the delete has propagated).
      const pending = reconcileDeletedTrips(initialTrips.map((t) => t.id));
      const visible = pending.length ? initialTrips.filter((t) => !pending.includes(t.id)) : initialTrips;
      setTrips(visible);
      idbSet(KEY, { trips: visible, savedAt: Date.now() }).then(() => setSavedAt(Date.now()));
      // Background prefetch: cache EVERY trip's calendar + notes so they can
      // be opened offline, not just the ones already visited.
      if (visible.length > 0) {
        setCaching(true);
        const supabase = createClient();
        prefetchAllTrips(supabase, visible).finally(() => setCaching(false));
      }
    } else {
      idbGet<{ trips: TripStub[]; savedAt: number }>(KEY).then((cached) => {
        if (cached) {
          setTrips(cached.trips);
          setSavedAt(cached.savedAt);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <>
      <OfflineBanner savedAt={savedAt} className="mt-4" />
      <ul className="mt-6 space-y-2.5">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trips/${t.id}`}
              prefetch
              className="card group flex items-center justify-between gap-3 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.name}</span>
                {t.start_date && t.end_date && (
                  <span className="mt-0.5 block text-xs text-ink/45">{dateRange(t.start_date, t.end_date)}</span>
                )}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/25 transition-colors group-hover:text-ink/50" />
            </Link>
          </li>
        ))}
        {trips.length === 0 && (
          <li className="rounded-3xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/45">
            No trips yet. Create your first one above.
          </li>
        )}
      </ul>
      {caching && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink/40">
          <Spinner className="h-3 w-3" />
          Saving trips for offline reading…
        </p>
      )}
    </>
  );
}

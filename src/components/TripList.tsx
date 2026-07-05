"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useOnline } from "@/hooks/useOnline";
import { createClient } from "@/lib/supabase/client";
import { idbGet, idbSet, prefetchAllTrips } from "@/lib/offlineStore";
import OfflineBanner from "@/components/OfflineBanner";

type TripStub = { id: string; name: string; created_at: string };

const KEY = "trips-list";

export default function TripList({ initialTrips }: { initialTrips: TripStub[] }) {
  const online = useOnline();
  const [trips, setTrips] = useState(initialTrips);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [caching, setCaching] = useState(false);

  useEffect(() => {
    if (online) {
      idbSet(KEY, { trips: initialTrips, savedAt: Date.now() }).then(() => setSavedAt(Date.now()));
      // Background prefetch: cache EVERY trip's calendar + notes so they can
      // be opened offline, not just the ones already visited.
      if (initialTrips.length > 0) {
        setCaching(true);
        const supabase = createClient();
        prefetchAllTrips(supabase, initialTrips).finally(() => setCaching(false));
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
      <OfflineBanner savedAt={savedAt} />
      <ul className="mt-6 space-y-2">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trips/${t.id}`}
              prefetch
              className="block rounded-xl border border-ink/10 bg-white p-4 font-medium shadow-sm hover:border-ink/30"
            >
              {t.name}
            </Link>
          </li>
        ))}
        {trips.length === 0 && (
          <li className="rounded-xl border border-dashed border-ink/20 p-8 text-center text-ink/50">
            No trips yet. Create your first one above.
          </li>
        )}
      </ul>
      {caching && (
        <p className="mt-3 text-xs text-ink/40">Saving trips for offline reading…</p>
      )}
    </>
  );
}

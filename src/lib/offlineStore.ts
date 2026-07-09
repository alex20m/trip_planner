// Minimal IndexedDB cache to read the last known trip data offline.
// No external dependency — raw IndexedDB is enough for what we store.

const DB_NAME = "planpal";
const DB_VERSION = 1;
const STORE = "snapshots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export interface TripSnapshot {
  trip: { id: string; name: string };
  role: string;
  events: unknown[];
  sections: unknown[];
  savedAt: number;
}

export const tripSnapshotKey = (tripId: string) => `trip:${tripId}`;

// A single app-wide "last synced" timestamp. Each view used to stamp its own
// cache entry with its own time (the trips list vs. a per-trip snapshot),
// which made the offline banner report different times on the home screen and
// inside a trip. Every view now reads and writes this shared value instead, so
// the "last saved data" time is consistent everywhere. Written whenever fresh
// server data is cached while online; read to render the offline banner.
const LAST_SYNCED_KEY = "last-synced";

export async function setLastSynced(ts: number = Date.now()): Promise<number> {
  await idbSet(LAST_SYNCED_KEY, ts);
  return ts;
}

export async function getLastSynced(): Promise<number | null> {
  return idbGet<number>(LAST_SYNCED_KEY);
}

/**
 * Fetches full data (role, events, notes) for a list of trips and saves each
 * trip as a snapshot in IndexedDB. Runs in the background when the home page
 * opens online, so that all trips can then be read offline — not just the ones
 * already opened. Errors on individual trips are swallowed so a broken trip
 * doesn't stop the others.
 */
export async function prefetchAllTrips(
  supabase: any,
  trips: { id: string; name: string }[]
): Promise<void> {
  await Promise.all(
    trips.map(async (trip) => {
      try {
        const [{ data: role }, { data: events }, { data: sections }] = await Promise.all([
          supabase.rpc("my_role", { p_trip: trip.id }),
          supabase.from("trip_events").select("*").eq("trip_id", trip.id).order("start_at"),
          supabase
            .from("note_sections")
            .select("*, notes(*)")
            .eq("trip_id", trip.id)
            .order("sort_order")
        ]);

        const snapshot: TripSnapshot = {
          trip: { id: trip.id, name: trip.name },
          role: role ?? "read",
          events: events ?? [],
          sections: (sections ?? []).map((s: any) => ({
            ...s,
            notes: (s.notes ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order)
          })),
          savedAt: Date.now()
        };
        await idbSet(tripSnapshotKey(trip.id), snapshot);
      } catch {
        /* skip this trip — the others still get cached */
      }
    })
  );
}

// Cross-navigation handoff for optimistic trip deletion.
//
// A trip is deleted from the trip detail page (TripView) but the result is
// felt on the home page (TripList), which is a separate route. When we delete
// optimistically we navigate home *before* the server has processed the
// delete, so the freshly server-rendered trip list may still include the
// trip. We record the deleted ids here (in sessionStorage so they survive the
// client-side navigation) and TripList filters them out until the server list
// no longer returns them.

const KEY = "optimistically-deleted-trips";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (ids.length === 0) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage failures (private mode, quota); the delete still happens
    // server-side, we just lose the optimistic hide.
  }
}

export function getDeletedTripIds(): string[] {
  return read();
}

export function markTripDeleted(id: string): void {
  const ids = read();
  if (!ids.includes(id)) write([...ids, id]);
}

export function unmarkTripDeleted(id: string): void {
  write(read().filter((x) => x !== id));
}

// Keep only the ids that are still present in the given server list; drop the
// rest (the delete has propagated). Returns the pruned set that is still
// pending on the server and should stay hidden.
export function reconcileDeletedTrips(presentIds: string[]): string[] {
  const stillPending = read().filter((id) => presentIds.includes(id));
  write(stillPending);
  return stillPending;
}

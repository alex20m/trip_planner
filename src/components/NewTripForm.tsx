"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/useOnline";
import Spinner from "@/components/Spinner";
import { PlusIcon } from "@/components/Icons";

const today = () => format(new Date(), "yyyy-MM-dd");
const defaultEnd = () => format(addDays(new Date(), 6), "yyyy-MM-dd");

export default function NewTripForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const online = useOnline();

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setName("");
    setStartDate(today());
    setEndDate(defaultEnd());
  }

  async function create() {
    if (!name.trim() || busy) return;
    setError(null);
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setBusy(true);
    // Navigating away is not instant (the trip page loads on the server), so
    // the button has to stay in its "Creating…" state until the new page takes
    // over. Clearing `busy` the moment the insert resolves would flip it back
    // to "Create trip" mid-navigation — looking like nothing happened, and
    // letting a second click create a duplicate trip.
    let navigating = false;
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be signed in to create a trip.");
        return;
      }
      const { data, error } = await supabase
        .from("trips")
        .insert({ name: name.trim(), owner_id: user.id, start_date: startDate, end_date: endDate })
        .select("id")
        .single();
      if (error) setError(error.message);
      else if (data) {
        navigating = true;
        // Bust the client Router Cache so the home page's server-rendered
        // trip list isn't served stale (for up to its ~30s staleTime) when
        // the user navigates back right after creating a trip.
        router.refresh();
        router.push(`/trips/${data.id}`);
      }
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => online && setOpen(true)}
        disabled={!online}
        title={online ? undefined : "Requires internet"}
        className="btn-primary w-full sm:w-auto"
      >
        <PlusIcon className="h-4 w-4" />
        New trip
      </button>
      {!online && <p className="mt-2 text-xs text-travel">Creating new trips requires an internet connection.</p>}

      {open && (
        <div className="modal-backdrop items-center" onClick={close}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">New trip</h2>
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Trip name, e.g. Rome 2026"
                disabled={busy}
                autoFocus
                className="field"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="label">
                  Start
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={busy}
                    className="field mt-1"
                  />
                </label>
                <label className="label">
                  End
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={busy}
                    className="field mt-1"
                  />
                </label>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              {!busy && (
                <button onClick={close} className="btn-secondary">
                  Cancel
                </button>
              )}
              <button onClick={create} disabled={busy || !name.trim()} className="btn-primary">
                {busy && <Spinner className="h-3.5 w-3.5" />}
                {busy ? "Creating…" : "Create trip"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

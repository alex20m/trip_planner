"use client";
import { useOnline } from "@/hooks/useOnline";

export default function OfflineBanner({ savedAt }: { savedAt?: number | null }) {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="mb-4 rounded-xl border border-travel/30 bg-travel/10 px-3 py-2 text-sm text-travel">
      Offline — showing last saved data
      {savedAt ? ` (${new Date(savedAt).toLocaleString("sv-SE")})` : ""}. Changes can't be saved until you're back online.
    </div>
  );
}

"use client";
import { useOnline } from "@/hooks/useOnline";

export default function OfflineBanner({ savedAt }: { savedAt?: number | null }) {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-travel/20 bg-travel/10 px-3.5 py-2.5 text-sm text-travel">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-travel" />
      Offline — showing last saved data
      {savedAt ? ` (${new Date(savedAt).toLocaleString("sv-SE")})` : ""}. Changes can&apos;t be saved until you&apos;re back online.
    </div>
  );
}

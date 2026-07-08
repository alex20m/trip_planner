"use client";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { useOnline } from "@/hooks/useOnline";

export default function OfflineBanner({ savedAt, className = "" }: { savedAt?: number | null; className?: string }) {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-2xl border border-travel/20 bg-travel/10 px-3.5 py-2.5 text-sm text-travel ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-travel" />
      Offline — showing last saved data
      {savedAt ? ` (${format(new Date(savedAt), "d MMM, HH:mm", { locale: enUS })})` : ""}. Changes can&apos;t be saved
      until you&apos;re back online.
    </div>
  );
}

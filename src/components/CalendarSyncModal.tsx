"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/useOnline";
import Spinner from "@/components/Spinner";

export default function CalendarSyncModal({
  tripId,
  token,
  onClose
}: {
  tripId: string;
  token: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const [tok, setTok] = useState(token);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const httpsUrl = `${origin}/api/calendar/${tok}`;
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
  // Outlook.com "subscribe from web" — opens directly in your Outlook calendar
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=PlanPal`;
  // Google Calendar "add by URL" — cid should be the webcal link
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  async function copy() {
    await navigator.clipboard.writeText(httpsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotate() {
    if (!confirm("Create a new link? The old one will stop working in every calendar that subscribes to it.")) return;
    setRotating(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("rotate_calendar_token", { p_trip: tripId });
    if (data) setTok(data);
    setRotating(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Sync calendar</h2>
        <p className="mb-4 text-sm text-ink/55">
          Subscribe to this trip in your calendar. The feed is always current — your changes appear
          the next time your calendar app fetches it (Apple ~every 5 min if you set it, Outlook can take longer).
        </p>

        <div className="space-y-2">
          {/* Apple / iCloud */}
          <a
            href={webcalUrl}
            className="flex items-center justify-between rounded-xl border border-ink/10 bg-surface px-4 py-3 text-sm font-medium transition-colors hover:border-ink/25 hover:bg-ink/[0.02]"
          >
            <span> Add to Apple / iCloud Calendar</span>
            <span className="text-ink/35">›</span>
          </a>

          {/* Outlook */}
          <a
            href={outlookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-ink/10 bg-surface px-4 py-3 text-sm font-medium transition-colors hover:border-ink/25 hover:bg-ink/[0.02]"
          >
            <span>📅 Add to Outlook.com</span>
            <span className="text-ink/35">›</span>
          </a>

          {/* Google */}
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-ink/10 bg-surface px-4 py-3 text-sm font-medium transition-colors hover:border-ink/25 hover:bg-ink/[0.02]"
          >
            <span>🗓 Add to Google Calendar</span>
            <span className="text-ink/35">›</span>
          </a>
        </div>

        {/* Manuell URL */}
        <div className="mt-3 rounded-xl bg-ink/5 p-3">
          <p className="mb-1 text-xs font-medium text-ink/60">Or copy the link manually:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={httpsUrl}
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-surface p-2 text-xs"
            />
            <button onClick={copy} className="btn-primary btn-sm">
              {copied ? "✓" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink/50">
            Outlook desktop: Calendar → Add calendar → Subscribe from web → paste.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={rotate}
            disabled={!online || rotating}
            className="flex items-center gap-1.5 text-xs text-ink/50 transition-colors hover:text-red-600 disabled:opacity-40"
          >
            {rotating && <Spinner className="h-3 w-3" />}
            {rotating ? "Creating…" : "Create new link (revoke the old one)"}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-ink/40">
          Anyone with the link can read this trip&apos;s calendar. Don&apos;t share it publicly — create a new link if it leaks.
        </p>
      </div>
    </div>
  );
}

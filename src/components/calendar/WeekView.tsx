"use client";
import { addDays, differenceInCalendarDays, format, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import type { TripEvent } from "@/lib/types";

const HOUR_PX = 44;
const START_HOUR = 6;
const END_HOUR = 24;

const COLORS = {
  activity: "border-activity bg-activity/10 text-activity",
  travel: "border-travel bg-travel/10 text-travel",
  accommodation: "border-stay bg-stay/15 text-stay"
} as const;

export default function WeekView({
  weekStart,
  events,
  onSelect
}: {
  weekStart: Date;
  events: TripEvent[];
  onSelect?: (e: TripEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const timed = events.filter(
    (e) => e.type !== "accommodation" && new Date(e.start_at) < weekEnd && new Date(e.start_at) >= weekStart
  );
  const stays = events.filter((e) => {
    if (e.type !== "accommodation") return false;
    const s = new Date(e.start_at);
    const en = e.end_at ? new Date(e.end_at) : s;
    return s < weekEnd && en >= weekStart;
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="min-w-[720px]">
        {/* Dagrubriker */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-ink/10">
          <div />
          {days.map((d) => (
            <div key={+d} className="border-l border-ink/5 p-2 text-center">
              <div className="text-[11px] uppercase tracking-wide text-ink/50">
                {format(d, "EEE", { locale: enUS })}
              </div>
              <div className={`text-sm font-semibold ${isSameDay(d, new Date()) ? "text-activity" : ""}`}>
                {format(d, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Accommodation: all-day row without a time */}
        {stays.length > 0 && (
          <div className="relative grid grid-cols-[52px_repeat(7,1fr)] border-b border-ink/10 py-1">
            <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-ink/40">Stays</div>
            <div className="relative col-span-7 col-start-2 grid grid-cols-7 gap-y-1">
              {stays.map((e) => {
                const s = new Date(e.start_at);
                const en = e.end_at ? new Date(e.end_at) : s;
                const startCol = Math.max(0, differenceInCalendarDays(s, weekStart));
                const endCol = Math.min(6, differenceInCalendarDays(en, weekStart));
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect?.(e)}
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}` }}
                    className={`mx-0.5 truncate rounded-lg border-l-4 px-2 py-1 text-left text-xs font-medium ${COLORS.accommodation}`}
                  >
                    🛏 {e.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tidsgrid */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)]">
          <div>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div key={i} style={{ height: HOUR_PX }} className="pr-1.5 text-right text-[10px] text-ink/40">
                {String(START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={+day} className="relative border-l border-ink/5" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} style={{ top: i * HOUR_PX }} className="absolute w-full border-t border-ink/5" />
              ))}
              {timed
                .filter((e) => isSameDay(new Date(e.start_at), day))
                .map((e) => {
                  const s = new Date(e.start_at);
                  const top = ((s.getHours() + s.getMinutes() / 60 - START_HOUR) * HOUR_PX);
                  const en = e.end_at ? new Date(e.end_at) : null;
                  const height = en
                    ? Math.max(22, ((+en - +s) / 3600000) * HOUR_PX)
                    : 22;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelect?.(e)}
                      style={{ top: Math.max(0, top), height }}
                      className={`absolute inset-x-0.5 overflow-hidden rounded-lg border-l-4 px-1.5 py-0.5 text-left text-xs font-medium leading-tight ${COLORS[e.type]}`}
                    >
                      <span className="block truncate">{e.title}</span>
                      <span className="block truncate text-[10px] opacity-70">
                        {format(s, "HH:mm")}
                        {en ? `–${format(en, "HH:mm")}` : ""}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";
import { addDays, differenceInCalendarDays, format, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import type { TripEvent } from "@/lib/types";
import { BedIcon } from "@/components/Icons";

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
  rangeStart,
  rangeEnd,
  onSelect
}: {
  weekStart: Date;
  events: TripEvent[];
  rangeStart: Date;
  rangeEnd: Date;
  onSelect?: (e: TripEvent) => void;
}) {
  // Only render the days of this week that actually fall within the trip's date range.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) => d >= rangeStart && d <= rangeEnd
  );
  const gridStart = days[0] ?? weekStart;
  const gridStyle = { gridTemplateColumns: `52px repeat(${days.length}, 1fr)` };
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
    <>
      {/* Agenda view: stacked days, no horizontal scrolling — used on small screens */}
      <div className="space-y-3 sm:hidden">
        {days.map((day) => {
          const dayStays = stays.filter((e) => {
            const s = new Date(e.start_at);
            const en = e.end_at ? new Date(e.end_at) : s;
            return s <= day && en >= day;
          });
          const dayTimed = timed
            .filter((e) => isSameDay(new Date(e.start_at), day))
            .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
          const isToday = isSameDay(day, new Date());

          return (
            <div key={+day} className="card overflow-hidden">
              <div className={`flex items-baseline gap-2 border-b border-ink/10 px-3 py-2 ${isToday ? "bg-activity/5" : ""}`}>
                <span className="text-[11px] uppercase tracking-wide text-ink/45">
                  {format(day, "EEE", { locale: enUS })}
                </span>
                <span className={`text-sm font-semibold ${isToday ? "text-activity" : ""}`}>
                  {format(day, "d MMM", { locale: enUS })}
                </span>
              </div>
              <div className="space-y-1.5 p-2">
                {dayStays.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelect?.(e)}
                    className={`flex w-full items-center gap-2 rounded-xl border-l-4 px-3 py-2 text-left text-sm font-semibold transition-transform active:scale-[0.99] ${COLORS.accommodation}`}
                  >
                    <BedIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {dayTimed.map((e) => {
                  const s = new Date(e.start_at);
                  const en = e.end_at ? new Date(e.end_at) : null;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelect?.(e)}
                      className={`w-full rounded-xl border-l-4 px-3 py-2 text-left transition-transform active:scale-[0.99] ${COLORS[e.type]}`}
                    >
                      <span className="block truncate text-sm font-semibold leading-snug">{e.title}</span>
                      <span className="mt-0.5 block truncate text-xs font-medium tabular-nums opacity-75">
                        {format(s, "HH:mm")}
                        {en ? `–${format(en, "HH:mm")}` : ""}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </button>
                  );
                })}
                {dayStays.length === 0 && dayTimed.length === 0 && (
                  <p className="px-1.5 py-1 text-sm text-ink/30">No events</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time-grid view: full week at a glance — used from tablet width up */}
      <div className="card hidden overflow-x-auto sm:block">
        <div className="min-w-[720px]">
          {/* Day headers */}
        <div className="grid border-b border-ink/10" style={gridStyle}>
          <div />
          {days.map((d) => (
            <div key={+d} className={`border-l border-ink/5 p-2 text-center ${isSameDay(d, new Date()) ? "bg-activity/5" : ""}`}>
              <div className="text-[11px] uppercase tracking-wide text-ink/45">
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
          <div className="relative grid border-b border-ink/10 py-1" style={gridStyle}>
            <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-ink/45">Stays</div>
            <div
              className="relative grid gap-y-1"
              style={{ gridColumn: `2 / ${days.length + 2}`, gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
            >
              {stays.map((e) => {
                const s = new Date(e.start_at);
                const en = e.end_at ? new Date(e.end_at) : s;
                const startCol = Math.max(0, differenceInCalendarDays(s, gridStart));
                const endCol = Math.min(days.length - 1, differenceInCalendarDays(en, gridStart));
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect?.(e)}
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}` }}
                    className={`mx-0.5 flex items-center gap-1 truncate rounded-lg border-l-4 px-2 py-1 text-left text-xs font-medium shadow-sm transition-transform hover:-translate-y-px ${COLORS.accommodation}`}
                  >
                    <BedIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{e.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Time grid */}
        <div className="grid" style={gridStyle}>
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
                      className={`absolute inset-x-0.5 flex flex-col items-start justify-start overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-xs leading-tight shadow-sm transition-transform hover:z-10 hover:-translate-y-px ${COLORS[e.type]}`}
                    >
                      <span className="block w-full truncate font-semibold">{e.title}</span>
                      <span className="block w-full truncate text-[10px] font-medium tabular-nums opacity-70">
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
    </>
  );
}

"use client";
import { addDays, differenceInCalendarDays, format, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { isAllDayEvent, parseDateOnly, type EventType, type TripEvent } from "@/lib/types";
import { BedIcon, CompassIcon, NoteIcon, PlaneIcon } from "@/components/Icons";

// All-day events' start_at/end_at are stored as UTC-midnight date-only values.
// Parsing them with `new Date(iso)` keeps that UTC instant, which in any
// timezone ahead of UTC lands after local midnight — so an event's first
// day fails `allDayStart(e) <= day` and silently drops off. Route through
// parseDateOnly (local midnight, like `day`/`weekStart`) instead.
const allDayStart = (e: TripEvent) => parseDateOnly(e.start_at.slice(0, 10));
const allDayEnd = (e: TripEvent) => (e.end_at ? parseDateOnly(e.end_at.slice(0, 10)) : allDayStart(e));

const HOUR_PX = 44;
const START_HOUR = 6;
const END_HOUR = 24;

const COLORS = {
  activity: "border-activity bg-activity/10 text-activity",
  travel: "border-travel bg-travel/10 text-travel",
  accommodation: "border-stay bg-stay/15 text-stay"
} as const;

const TYPE_ICONS: Record<EventType, typeof BedIcon> = {
  activity: CompassIcon,
  travel: PlaneIcon,
  accommodation: BedIcon
};

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
    (e) => !isAllDayEvent(e) && new Date(e.start_at) < weekEnd && new Date(e.start_at) >= weekStart
  );
  const allDayEvents = events.filter((e) => {
    if (!isAllDayEvent(e)) return false;
    return allDayStart(e) < weekEnd && allDayEnd(e) >= weekStart;
  });

  return (
    <>
      {/* Agenda view: stacked days, no horizontal scrolling — used on small screens */}
      <div className="space-y-3 sm:hidden">
        {days.map((day) => {
          const dayAllDay = allDayEvents.filter((e) => allDayStart(e) <= day && allDayEnd(e) >= day);
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
              <div className="space-y-1.5 px-2 pb-2 pt-1.5">
                {dayAllDay.map((e) => {
                  const Icon = TYPE_ICONS[e.type];
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelect?.(e)}
                      className={`w-full rounded-xl border-l-4 px-3 py-2 text-left transition-transform active:scale-[0.99] ${COLORS[e.type]}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{e.title}</span>
                      </span>
                      {e.location && (
                        <span className="mt-0.5 block truncate text-xs font-medium opacity-75">{e.location}</span>
                      )}
                      <EventNote text={e.description} />
                    </button>
                  );
                })}
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
                      <EventNote text={e.description} />
                    </button>
                  );
                })}
                {dayAllDay.length === 0 && dayTimed.length === 0 && (
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

        {/* All-day row without a time: accommodation plus any event marked "All day" */}
        {allDayEvents.length > 0 && (
          <div className="relative grid border-b border-ink/10 py-1" style={gridStyle}>
            <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-ink/45">All day</div>
            <div
              className="relative grid gap-y-1"
              style={{ gridColumn: `2 / ${days.length + 2}`, gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
            >
              {allDayEvents.map((e) => {
                const startCol = Math.max(0, differenceInCalendarDays(allDayStart(e), gridStart));
                const endCol = Math.min(days.length - 1, differenceInCalendarDays(allDayEnd(e), gridStart));
                const Icon = TYPE_ICONS[e.type];
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect?.(e)}
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}` }}
                    className={`mx-0.5 flex items-center gap-1 truncate rounded-lg border-l-4 px-2 py-1 text-left text-xs font-medium shadow-sm transition-transform hover:-translate-y-px ${COLORS[e.type]}`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="max-w-[70%] shrink-0 truncate">{e.title}</span>
                    {e.location && (
                      <span className="truncate font-normal opacity-70">· {e.location}</span>
                    )}
                    {e.description && (
                      <span className="truncate font-normal italic opacity-70">· {e.description}</span>
                    )}
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
                      {/* The block's height encodes the event's duration, so the note
                          must never stretch it: show one truncated line, and only when
                          the block is tall enough to fit it cleanly. */}
                      {e.description && height >= 50 && (
                        <span className="mt-0.5 flex w-full min-w-0 items-center gap-1 text-[10px] italic opacity-70">
                          <NoteIcon className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{e.description}</span>
                        </span>
                      )}
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

// Note preview on agenda cards: clamped to two lines so a long note never
// balloons the card — the full text lives in the event detail view.
function EventNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span className="mt-0.5 flex items-start gap-1.5 text-xs font-normal italic leading-snug opacity-70">
      <NoteIcon className="mt-px h-3 w-3 shrink-0" />
      <span className="line-clamp-2 min-h-0 min-w-0 break-words">{text}</span>
    </span>
  );
}

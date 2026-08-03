"use client";
import { useEffect, useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { isAllDayEvent, type EventType, type TripEvent } from "@/lib/types";
import { assignAllDayLanes, isAllDayInRange, isAllDayShownOnDay, locationLabel } from "@/lib/calendarLayout";
import {
  compareWallClock,
  isOnWallClockDay,
  toDayKey,
  wallClockDay,
  wallClockDiffMinutes,
  wallClockMinutes,
  wallClockTime
} from "@/lib/datetime";
import { BedIcon, CompassIcon, NoteIcon, PlaneIcon, PlusIcon } from "@/components/Icons";

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
  onSelect,
  onAddEvent
}: {
  weekStart: Date;
  events: TripEvent[];
  rangeStart: Date;
  rangeEnd: Date;
  onSelect?: (e: TripEvent) => void;
  // Present only when the user may edit: pressing a day (its header, or an
  // empty slot in the time grid) starts a new event on that day. The grid
  // also passes the clicked hour so the composer opens at that time.
  onAddEvent?: (day: Date, hour?: number) => void;
}) {
  // Only render the days of this week that actually fall within the trip's date range.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) => d >= rangeStart && d <= rangeEnd
  );
  const gridStart = days[0] ?? weekStart;
  const gridStyle = { gridTemplateColumns: `52px repeat(${days.length}, 1fr)` };
  const weekLastDay = addDays(weekStart, 6);

  // Events are placed by their wall-clock day, never by the instant a device
  // in some timezone would resolve them to.
  const weekStartKey = toDayKey(weekStart);
  const weekEndKey = toDayKey(weekLastDay);
  const timed = events.filter((e) => {
    if (isAllDayEvent(e)) return false;
    const key = wallClockDay(e.start_at);
    return !!key && key >= weekStartKey && key <= weekEndKey;
  });
  const allDayEvents = events.filter((e) => isAllDayEvent(e) && isAllDayInRange(e, weekStart, weekLastDay));
  const allDayChips = assignAllDayLanes(allDayEvents, gridStart, days.length);

  // Opening on the right week is only half of it. On a phone the week is a
  // stack of day cards, so today can sit well below the fold; and in the narrow
  // band where the time grid scrolls sideways, today's column can sit off to
  // the right. Both are brought into view once, when the calendar first
  // appears — an empty dependency list, so paging to another week leaves the
  // page exactly where the reader put it.
  //
  // Only one of the two layouts is on screen at a time; the other is inside a
  // `display: none` subtree, where it has no box, so `scrollIntoView` does
  // nothing and the grid measures zero. Neither can move the wrong layout.
  const todayCardRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const todayColumnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Instant, not smooth: this is where the page starts, not a move away from
    // somewhere the reader was already looking.
    todayCardRef.current?.scrollIntoView?.({ block: "start" });

    const grid = gridScrollRef.current;
    const column = todayColumnRef.current;
    if (!grid || !column || grid.scrollWidth <= grid.clientWidth) return;
    grid.scrollLeft += column.getBoundingClientRect().left - grid.getBoundingClientRect().left;
  }, []);

  return (
    <>
      {/* Agenda view: stacked days, no horizontal scrolling — used on small screens */}
      <div className="space-y-3 sm:hidden">
        {days.map((day) => {
          const dayAllDay = allDayEvents.filter((e) => isAllDayShownOnDay(e, day));
          // A stay is where the day ends, so it always renders as the day's
          // last card; other all-day events lead the day.
          const dayStays = dayAllDay.filter((e) => e.type === "accommodation");
          const dayLeading = dayAllDay.filter((e) => e.type !== "accommodation");
          const dayTimed = timed
            .filter((e) => isOnWallClockDay(e.start_at, day))
            .sort((a, b) => compareWallClock(a.start_at, b.start_at));
          const isToday = isSameDay(day, new Date());

          const headerLabel = (
            <>
              <span className="text-[11px] uppercase tracking-wide text-ink/45">
                {format(day, "EEE", { locale: enUS })}
              </span>
              <span className={`text-sm font-semibold ${isToday ? "text-activity" : ""}`}>
                {format(day, "d MMM", { locale: enUS })}
              </span>
            </>
          );

          return (
            <div key={+day} ref={isToday ? todayCardRef : undefined} className="card overflow-hidden">
              {/* With edit rights the whole header is a press target — it works
                  the same whether the day already has events or is empty. */}
              {onAddEvent ? (
                <button
                  type="button"
                  onClick={() => onAddEvent(day)}
                  aria-label={`Add event on ${format(day, "d MMM", { locale: enUS })}`}
                  className={`flex w-full items-baseline gap-2 border-b border-ink/10 px-3 py-2 text-left transition-colors active:bg-ink/5 ${isToday ? "bg-activity/5" : ""}`}
                >
                  {headerLabel}
                  <PlusIcon className="ml-auto h-4 w-4 self-center text-ink/35" />
                </button>
              ) : (
                <div className={`flex items-baseline gap-2 border-b border-ink/10 px-3 py-2 ${isToday ? "bg-activity/5" : ""}`}>
                  {headerLabel}
                </div>
              )}
              {/* flex + gap (not margins) so the gap between any two cards is
                  always exactly the same — margin-based spacing drifted. */}
              <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1.5">
                {dayLeading.map((e) => (
                  <AgendaAllDayCard key={e.id} event={e} onSelect={onSelect} />
                ))}
                {dayTimed.map((e) => {
                  const loc = locationLabel(e);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelect?.(e)}
                      className={`w-full rounded-xl border-l-4 px-3 py-2 text-left transition-transform active:scale-[0.99] ${COLORS[e.type]}`}
                    >
                      <span className="block truncate text-sm font-semibold leading-snug">{e.title}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium opacity-75">
                        <span className="shrink-0 tabular-nums">
                          {wallClockTime(e.start_at)}
                          {e.end_at ? `–${wallClockTime(e.end_at)}` : ""}
                        </span>
                        {loc && <span className="shrink-0">·</span>}
                        <LocationLabel event={e} />
                      </span>
                      <EventNote text={e.description} />
                    </button>
                  );
                })}
                {dayStays.map((e) => (
                  <AgendaAllDayCard key={e.id} event={e} onSelect={onSelect} />
                ))}
                {dayAllDay.length === 0 && dayTimed.length === 0 && (
                  <p className="px-1.5 py-1 text-sm text-ink/30">No events</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time-grid view: full week at a glance — used from tablet width up */}
      <div ref={gridScrollRef} className="card hidden overflow-x-auto sm:block">
        <div className="min-w-[720px]">
          {/* Day headers */}
        <div className="grid border-b border-ink/10" style={gridStyle}>
          <div />
          {days.map((d) => {
            const isToday = isSameDay(d, new Date());
            const label = (
              <>
                <div className="text-[11px] uppercase tracking-wide text-ink/45">
                  {format(d, "EEE", { locale: enUS })}
                </div>
                <div className={`text-sm font-semibold ${isToday ? "text-activity" : ""}`}>
                  {format(d, "d")}
                </div>
              </>
            );
            return onAddEvent ? (
              <button
                key={+d}
                type="button"
                onClick={() => onAddEvent(d)}
                aria-label={`Add event on ${format(d, "d MMM", { locale: enUS })}`}
                title="Add event"
                className={`border-l border-ink/5 p-2 text-center transition-colors hover:bg-ink/5 ${isToday ? "bg-activity/5" : ""}`}
              >
                {label}
              </button>
            ) : (
              <div key={+d} className={`border-l border-ink/5 p-2 text-center ${isToday ? "bg-activity/5" : ""}`}>
                {label}
              </div>
            );
          })}
        </div>

        {/* All-day row without a time: accommodation plus any event marked "All day" */}
        {allDayEvents.length > 0 && (
          <div className="relative grid border-b border-ink/10 py-1" style={gridStyle}>
            <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-ink/45">All day</div>
            <div
              className="relative grid gap-y-1"
              style={{ gridColumn: `2 / ${days.length + 2}`, gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
            >
              {allDayChips.map(({ event: e, startCol, endCol, lane }) => {
                const Icon = TYPE_ICONS[e.type];
                const loc = locationLabel(e);
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect?.(e)}
                    // Explicit rows: auto-placement left uneven blank gaps
                    // between chips stacked in the same day column.
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 1 }}
                    className={`mx-0.5 flex items-center gap-1 truncate rounded-lg border-l-4 px-2 py-1 text-left text-xs font-medium shadow-sm transition-transform hover:-translate-y-px ${COLORS[e.type]}`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="max-w-[70%] shrink-0 truncate">{e.title}</span>
                    {loc && (
                      <span className="flex min-w-0 items-center gap-1 font-normal opacity-70">
                        <span className="shrink-0">·</span>
                        <LocationLabel event={e} />
                      </span>
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
            <div
              key={+day}
              // The grid's day column, not its header: the header is a button
              // when the trip is editable and a div when it isn't, while this
              // one is always a div and sits in the same grid column.
              ref={isSameDay(day, new Date()) ? todayColumnRef : undefined}
              className={`relative border-l border-ink/5${onAddEvent ? " cursor-pointer" : ""}`}
              style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}
              title={onAddEvent ? `Add event on ${format(day, "d MMM", { locale: enUS })}` : undefined}
              onClick={
                onAddEvent
                  ? (ev) => {
                      // Clicks on an event block keep opening that event; only
                      // presses on free grid space start a new one, so this works
                      // on busy days too. The clicked row picks the start hour.
                      if ((ev.target as HTMLElement).closest("button")) return;
                      const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                      const hour = Math.min(END_HOUR - 1, Math.max(START_HOUR, START_HOUR + Math.floor(y / HOUR_PX)));
                      onAddEvent(day, hour);
                    }
                  : undefined
              }
            >
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} style={{ top: i * HOUR_PX }} className="absolute w-full border-t border-ink/5" />
              ))}
              {timed
                .filter((e) => isOnWallClockDay(e.start_at, day))
                .map((e) => {
                  const top = (wallClockMinutes(e.start_at) / 60 - START_HOUR) * HOUR_PX;
                  const height = e.end_at
                    ? Math.max(22, (wallClockDiffMinutes(e.start_at, e.end_at) / 60) * HOUR_PX)
                    : 22;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelect?.(e)}
                      style={{ top: Math.max(0, top), height }}
                      className={`absolute inset-x-0.5 flex flex-col items-start justify-start overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-xs leading-tight shadow-sm transition-transform hover:z-10 hover:-translate-y-px ${COLORS[e.type]}`}
                    >
                      <span className="block w-full truncate font-semibold">{e.title}</span>
                      <span className="flex w-full min-w-0 items-center gap-1 text-[10px] font-medium opacity-70">
                        <span className="shrink-0 tabular-nums">
                          {wallClockTime(e.start_at)}
                          {e.end_at ? `–${wallClockTime(e.end_at)}` : ""}
                        </span>
                        {locationLabel(e) && <span className="shrink-0">·</span>}
                        <LocationLabel event={e} />
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

function AgendaAllDayCard({ event: e, onSelect }: { event: TripEvent; onSelect?: (e: TripEvent) => void }) {
  const Icon = TYPE_ICONS[e.type];
  const loc = locationLabel(e);
  return (
    <button
      onClick={() => onSelect?.(e)}
      className={`w-full rounded-xl border-l-4 px-3 py-2 text-left transition-transform active:scale-[0.99] ${COLORS[e.type]}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{e.title}</span>
      </span>
      {loc && (
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium opacity-75">
          <LocationLabel event={e} />
        </span>
      )}
      <EventNote text={e.description} />
    </button>
  );
}

// Location line for a card. A travel leg reads as "From → To": the arrow is
// kept full-weight and never shrinks, so the direction of travel stays visible
// even when the place names have to truncate on a narrow card. Non-travel
// events fall back to their plain location. Meant to sit inside a flex row.
function LocationLabel({ event: e }: { event: TripEvent }) {
  if (e.type === "travel" && e.location && e.end_location) {
    return (
      <span
        className="flex min-w-0 items-center gap-1"
        aria-label={`${e.location} to ${e.end_location}`}
      >
        <span className="min-w-0 truncate">{e.location}</span>
        <span aria-hidden className="shrink-0 font-semibold not-italic">→</span>
        <span className="min-w-0 truncate">{e.end_location}</span>
      </span>
    );
  }
  const loc = locationLabel(e);
  return loc ? <span className="min-w-0 truncate">{loc}</span> : null;
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

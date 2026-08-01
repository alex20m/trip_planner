"use client";
import { enUS } from "date-fns/locale";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS, isAllDayEvent } from "@/lib/types";
import { formatWallClockDay, wallClockDay, wallClockTime } from "@/lib/datetime";
import { BedIcon, CompassIcon, PencilIcon, PlaneIcon } from "@/components/Icons";

const TYPE_ICONS: Record<EventType, typeof BedIcon> = {
  activity: CompassIcon,
  travel: PlaneIcon,
  accommodation: BedIcon
};

// Times are wall-clock values: rendered straight from the stored calendar
// fields, never routed through the device's timezone, so the label reads the
// same abroad as it did at home.
const day = (v: string, pattern: string) => formatWallClockDay(v, pattern, { locale: enUS });

function whenLabel(event: TripEvent): string {
  if (isAllDayEvent(event)) {
    if (!event.end_at || wallClockDay(event.end_at) === wallClockDay(event.start_at)) {
      return day(event.start_at, "EEE d MMM yyyy");
    }
    return `${day(event.start_at, "EEE d MMM")} → ${day(event.end_at, "EEE d MMM yyyy")}`;
  }
  const startLabel = `${day(event.start_at, "EEE d MMM yyyy")}, ${wallClockTime(event.start_at)}`;
  if (!event.end_at) return startLabel;
  return wallClockDay(event.end_at) === wallClockDay(event.start_at)
    ? `${startLabel} – ${wallClockTime(event.end_at)}`
    : `${startLabel} – ${day(event.end_at, "EEE d MMM yyyy")}, ${wallClockTime(event.end_at)}`;
}

export default function EventDetail({
  event,
  canEdit,
  onClose,
  onEdit
}: {
  event: TripEvent;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const Icon = TYPE_ICONS[event.type];
  const colors = EVENT_COLORS[event.type];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${colors.border} ${colors.bg}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span className="chip">{colors.label}</span>
            <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">{event.title}</h2>
          </div>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="label">When</dt>
            <dd className="mt-0.5 text-ink/80">{whenLabel(event)}</dd>
          </div>
          {event.type === "travel" && event.end_location ? (
            <>
              {event.location && (
                <div>
                  <dt className="label">From</dt>
                  <dd className="mt-0.5 break-words text-ink/80">{event.location}</dd>
                </div>
              )}
              <div>
                <dt className="label">To</dt>
                <dd className="mt-0.5 break-words text-ink/80">{event.end_location}</dd>
              </div>
            </>
          ) : (
            event.location && (
              <div>
                <dt className="label">Where</dt>
                <dd className="mt-0.5 break-words text-ink/80">{event.location}</dd>
              </div>
            )
          )}
          {event.description && (
            <div>
              <dt className="label">Notes</dt>
              <dd className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2.5 leading-relaxed text-ink/80">
                {event.description}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary ml-auto">
            Close
          </button>
          {canEdit && (
            <button onClick={onEdit} className="btn-primary">
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

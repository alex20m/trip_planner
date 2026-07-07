"use client";
import { format, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import type { EventType, TripEvent } from "@/lib/types";
import { EVENT_COLORS, parseDateOnly } from "@/lib/types";
import { BedIcon, CompassIcon, PencilIcon, PlaneIcon } from "@/components/Icons";

const TYPE_ICONS: Record<EventType, typeof BedIcon> = {
  activity: CompassIcon,
  travel: PlaneIcon,
  accommodation: BedIcon
};

// Accommodation dates are stored at UTC midnight, so read the calendar date
// straight off the ISO string rather than converting through the local zone.
function whenLabel(event: TripEvent): string {
  if (event.type === "accommodation") {
    const checkIn = parseDateOnly(event.start_at.slice(0, 10));
    if (!event.end_at) return format(checkIn, "EEE d MMM yyyy", { locale: enUS });
    const checkOut = parseDateOnly(event.end_at.slice(0, 10));
    return `${format(checkIn, "EEE d MMM", { locale: enUS })} → ${format(checkOut, "EEE d MMM yyyy", { locale: enUS })}`;
  }
  const start = new Date(event.start_at);
  const startLabel = format(start, "EEE d MMM yyyy, HH:mm", { locale: enUS });
  if (!event.end_at) return startLabel;
  const end = new Date(event.end_at);
  return isSameDay(start, end)
    ? `${startLabel} – ${format(end, "HH:mm", { locale: enUS })}`
    : `${startLabel} – ${format(end, "EEE d MMM yyyy, HH:mm", { locale: enUS })}`;
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
          {event.location && (
            <div>
              <dt className="label">Where</dt>
              <dd className="mt-0.5 break-words text-ink/80">{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div>
              <dt className="label">Notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-ink/80">{event.description}</dd>
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

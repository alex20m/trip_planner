export type TripRole = "owner" | "edit" | "read";
export type EventType = "activity" | "travel" | "accommodation";

export interface Trip {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  calendar_token?: string;
}

// Parses a "YYYY-MM-DD" date-only string as local midnight (not UTC),
// matching how date-fns functions like startOfWeek/addDays operate.
export const parseDateOnly = (s: string) => new Date(`${s}T00:00:00`);

export interface TripEvent {
  id: string;
  trip_id: string;
  title: string;
  type: EventType;
  start_at: string;
  end_at: string | null;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  description: string | null;
  all_day: boolean;
  // Travel legs run between two places: `location` is where the leg starts and
  // `end_location` where it ends. Optional because rows and offline snapshots
  // from before the columns existed lack them; null on non-travel events.
  end_location?: string | null;
  end_location_lat?: number | null;
  end_location_lng?: number | null;
  updated_at?: string;
}

// Accommodation is inherently all-day; activity/travel events opt in via `all_day`.
export const isAllDayEvent = (e: TripEvent) => e.type === "accommodation" || e.all_day;

// A section is either a tick-box checklist (individual `notes` rows) or a
// single free-form text block (`body`). Older rows predate the column, so
// treat a missing `kind` as "checklist".
export type NoteSectionKind = "checklist" | "freeform";

export interface NoteSection {
  id: string;
  trip_id: string;
  title: string;
  sort_order: number;
  kind?: NoteSectionKind;
  body?: string | null;
  notes: Note[];
}

export interface Note {
  id: string;
  section_id: string;
  content: string;
  done: boolean;
  sort_order: number;
}

export const ROLE_RANK: Record<TripRole, number> = { owner: 3, edit: 2, read: 1 };
export const canEdit = (r: TripRole | null) => !!r && ROLE_RANK[r] >= 2;

export const EVENT_COLORS: Record<EventType, { bg: string; border: string; label: string }> = {
  activity: { bg: "bg-activity/10", border: "border-activity", label: "Activity" },
  travel: { bg: "bg-travel/10", border: "border-travel", label: "Travel" },
  accommodation: { bg: "bg-stay/10", border: "border-stay", label: "Stay" }
};

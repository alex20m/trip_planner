import type { Note } from "@/lib/types";

/**
 * How long a just-toggled note holds its place before the list rearranges.
 * Ticking a box and having the row leave in the same frame reads as "the note
 * vanished"; pausing on the spot lets the tick and strike-through register as
 * the reason it then moves.
 */
export const NOTE_SETTLE_MS = 450;

/**
 * Checklist ordering: ticked-off notes sink to the bottom of their section so
 * the outstanding ones stay together at the top.
 *
 * Within each group the existing order is kept, except for `movedId` — the note
 * the user just acted on — which is placed at the end of the group it now
 * belongs to. That way ticking a note sends it to the very bottom, and
 * unticking it brings it back as the *last* unchecked note rather than to
 * wherever it originally sat.
 */
export function sortNotesByDone(notes: Note[], movedId?: string): Note[] {
  const moved = movedId ? notes.find((n) => n.id === movedId) : undefined;
  const rest = moved ? notes.filter((n) => n.id !== moved.id) : notes;
  const open = rest.filter((n) => !n.done);
  const done = rest.filter((n) => n.done);
  if (moved) (moved.done ? done : open).push(moved);
  return [...open, ...done];
}

/**
 * Renumbers `sort_order` to match the array order, so the arrangement survives
 * a reload. Untouched notes keep their identity, which lets callers persist
 * only the rows that actually moved.
 */
export function resequenceNotes(notes: Note[]): Note[] {
  return notes.map((n, i) => (n.sort_order === i ? n : { ...n, sort_order: i }));
}

/** The notes whose `sort_order` differs between two arrangements of a section. */
export function movedNotes(before: Note[], after: Note[]): Note[] {
  const previous = new Map(before.map((n) => [n.id, n.sort_order]));
  return after.filter((n) => previous.get(n.id) !== n.sort_order);
}

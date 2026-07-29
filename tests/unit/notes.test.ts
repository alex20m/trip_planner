import { describe, it, expect } from "vitest";
import { sortNotesByDone, resequenceNotes, movedNotes } from "@/lib/notes";
import type { Note } from "@/lib/types";

const note = (id: string, done: boolean, sort_order: number): Note => ({
  id,
  section_id: "section-1",
  content: id,
  done,
  sort_order
});

const ids = (notes: Note[]) => notes.map((n) => n.id);

describe("sortNotesByDone", () => {
  it("sinks checked notes below unchecked ones, keeping each group's order", () => {
    const notes = [note("a", true, 0), note("b", false, 1), note("c", true, 2), note("d", false, 3)];

    expect(ids(sortNotesByDone(notes))).toEqual(["b", "d", "a", "c"]);
  });

  it("moves a just-checked note to the very bottom of the section", () => {
    const notes = [note("a", false, 0), note("b", true, 1), note("c", false, 2)];
    const checked = notes.map((n) => (n.id === "a" ? { ...n, done: true } : n));

    expect(ids(sortNotesByDone(checked, "a"))).toEqual(["c", "b", "a"]);
  });

  it("returns a just-unchecked note as the last unchecked note, above the checked ones", () => {
    const notes = [note("a", false, 0), note("b", false, 1), note("c", true, 2), note("d", true, 3)];
    const unchecked = notes.map((n) => (n.id === "c" ? { ...n, done: false } : n));

    expect(ids(sortNotesByDone(unchecked, "c"))).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves other notes where they are when the moved one does not change group", () => {
    const notes = [note("a", false, 0), note("b", false, 1), note("c", false, 2)];

    expect(ids(sortNotesByDone(notes, "a"))).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the array it is given", () => {
    const notes = [note("a", true, 0), note("b", false, 1)];

    sortNotesByDone(notes, "a");

    expect(ids(notes)).toEqual(["a", "b"]);
  });
});

describe("resequenceNotes", () => {
  it("numbers sort_order by position", () => {
    const notes = [note("a", false, 5), note("b", true, 2)];

    expect(resequenceNotes(notes).map((n) => n.sort_order)).toEqual([0, 1]);
  });

  it("keeps the same object for notes that did not move", () => {
    const stay = note("a", false, 0);
    const [first, second] = resequenceNotes([stay, note("b", true, 7)]);

    expect(first).toBe(stay);
    expect(second.sort_order).toBe(1);
  });
});

describe("movedNotes", () => {
  it("reports only the notes whose position changed", () => {
    const before = [note("a", false, 0), note("b", true, 1), note("c", false, 2)];
    const after = resequenceNotes(sortNotesByDone(before, "b"));

    // "b" is checked, so it swaps places with "c"; "a" stays put.
    expect(ids(movedNotes(before, after))).toEqual(["c", "b"]);
  });

  it("reports nothing when the order is unchanged", () => {
    const before = [note("a", false, 0), note("b", true, 1)];

    expect(movedNotes(before, resequenceNotes(sortNotesByDone(before)))).toEqual([]);
  });
});

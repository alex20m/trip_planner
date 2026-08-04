"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note, NoteSection, NoteSectionKind } from "@/lib/types";
import { movedNotes, NOTE_SETTLE_MS, resequenceNotes, sortNotesByDone } from "@/lib/notes";
import { useSlideOnReorder } from "@/components/notes/useSlideOnReorder";
import Spinner from "@/components/Spinner";
import { PlusIcon, TrashIcon, XIcon } from "@/components/Icons";

export default function NotesPanel({
  tripId,
  sections,
  setSections,
  editable
}: {
  tripId: string;
  sections: NoteSection[];
  setSections: (updater: NoteSection[] | ((prev: NoteSection[]) => NoteSection[])) => void;
  editable: boolean;
}) {
  const [newSection, setNewSection] = useState("");
  const [newKind, setNewKind] = useState<NoteSectionKind>("checklist");
  const [addingSection, setAddingSection] = useState(false);
  const [sectionHint, setSectionHint] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<Set<string>>(new Set());
  const [pendingSections, setPendingSections] = useState<Set<string>>(new Set());
  // Sections with a note insert in flight — shown as a spinner only. Adding a
  // note must never block the field it was typed in (see `addNote`).
  const [savingSections, setSavingSections] = useState<Set<string>>(new Set());
  // Notes shown as ticked/unticked before the list has caught up: id -> new done.
  const [settling, setSettling] = useState<Map<string, boolean>>(new Map());
  const supabase = createClient();

  // Callbacks that resume after an await must not reorder from the snapshot the
  // render closure captured, which by then can be several toggles out of date.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // Per-section chain of in-flight note inserts, so several notes typed in
  // quick succession are saved one after another instead of racing.
  const addQueues = useRef(new Map<string, Promise<unknown>>());

  function clearSettling(id: string) {
    setSettling((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function markNotePending(id: string, pending: boolean) {
    setPendingNotes((prev) => {
      const next = new Set(prev);
      pending ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function markSectionPending(id: string, pending: boolean) {
    setPendingSections((prev) => {
      const next = new Set(prev);
      pending ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function markSectionSaving(id: string, saving: boolean) {
    setSavingSections((prev) => {
      const next = new Set(prev);
      saving ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function addSection() {
    if (addingSection) return;
    if (!newSection.trim()) {
      setSectionHint(true);
      return;
    }
    setSectionHint(false);
    setAddingSection(true);
    const { data } = await supabase
      .from("note_sections")
      .insert({
        trip_id: tripId,
        title: newSection.trim(),
        kind: newKind,
        body: newKind === "freeform" ? "" : null,
        sort_order: sections.length
      })
      .select()
      .single();
    if (data) setSections((prev) => [...prev, { ...data, notes: [] }]);
    setNewSection("");
    setNewKind("checklist");
    setAddingSection(false);
  }

  // Freeform sections persist their whole text block on `note_sections.body`.
  // Update state immediately so typing stays responsive; the debounced save
  // lives in the editor below.
  async function saveSectionBody(sectionId: string, body: string) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, body } : s)));
    await supabase.from("note_sections").update({ body }).eq("id", sectionId);
  }

  function setNotes(sectionId: string, notes: Note[]) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, notes } : s)));
  }

  // Writes the new positions for the notes that actually shifted. The order is
  // cosmetic, so a failure here leaves the (already saved) checked state alone
  // and simply means the section reloads in its previous arrangement.
  async function saveOrder(before: Note[], after: Note[]) {
    await Promise.all(
      movedNotes(before, after).map((n) =>
        supabase.from("notes").update({ sort_order: n.sort_order }).eq("id", n.id)
      )
    );
  }

  // Adding a note deliberately leaves the field it was typed in alone: it stays
  // enabled and focused, so the next note can be typed (and submitted) while
  // this one is still saving. Disabling the field mid-save blurs it, and every
  // keystroke and Enter that lands before the round trip finishes is then lost
  // — a fast typist silently loses a large share of their notes that way.
  //
  // Resolves to whether the note reached the server, so the caller can put the
  // text back in front of the user instead of dropping it on the floor.
  async function addNote(sectionId: string, content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) return false;
    markSectionSaving(sectionId, true);

    // Queue behind whatever is already saving for this section rather than
    // refusing the note: each insert numbers its `sort_order` from the list the
    // previous one produced, and dropping the submission would lose the note.
    const queues = addQueues.current;
    const saved = (queues.get(sectionId) ?? Promise.resolve()).then(() =>
      insertNote(sectionId, trimmed)
    );
    queues.set(sectionId, saved);

    const stored = await saved;
    // Only the last note in the queue stops the spinner.
    if (queues.get(sectionId) === saved) {
      queues.delete(sectionId);
      markSectionSaving(sectionId, false);
    }
    return stored;
  }

  // Never rejects: a save that fails comes back as `false` so the queue behind
  // it keeps running and the caller can report it.
  async function insertNote(sectionId: string, content: string): Promise<boolean> {
    const section = sectionsRef.current.find((s) => s.id === sectionId);
    if (!section) return false;

    let note: Note;
    try {
      const { data, error } = await supabase
        .from("notes")
        .insert({ section_id: sectionId, content, sort_order: section.notes.length })
        .select()
        .single();
      if (error || !data) return false;
      note = data as Note;
    } catch {
      return false;
    }

    // The list is read inside the updater rather than from the snapshot above:
    // a toggle — or a note queued behind this one — can have changed it while
    // the row was being written, and appending to the stale copy would drop it.
    let before: Note[] = [];
    let after: Note[] = [];
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        // A brand-new note is unchecked, so it belongs above anything already
        // ticked off rather than at the very bottom where it was appended.
        before = [...s.notes, note];
        after = resequenceNotes(sortNotesByDone(before, note.id));
        return { ...s, notes: after };
      })
    );

    // The note itself is stored; the ordering is cosmetic, so a failure here
    // must not report it back as unsaved.
    try {
      await saveOrder(before, after);
    } catch {
      /* the section simply reloads in its previous arrangement */
    }
    return true;
  }

  // Optimistic: the box ticks instantly (no spinner), and rolls back if the
  // server rejects it. Checking sinks the note to the bottom of the section;
  // unchecking lifts it back above the ticked ones, as the last unchecked note.
  //
  // The move is deliberately held back: `settling` carries the new checked state
  // on its own for a beat, so the note is visibly ticked where the user clicked
  // it before the list rearranges. Because the note's own `done` is untouched
  // until then, the render-time sort leaves it in place meanwhile.
  async function toggleNote(note: Note) {
    if (settling.has(note.id)) return;
    const done = !note.done;
    setSettling((prev) => new Map(prev).set(note.id, done));

    const settled = new Promise((resolve) => setTimeout(resolve, NOTE_SETTLE_MS));
    const { error } = await supabase.from("notes").update({ done }).eq("id", note.id);
    if (error) {
      clearSettling(note.id);
      return;
    }
    await settled;

    // Reorder against the freshest notes: another toggle may have landed while
    // this one was settling, and the render closure would not have seen it.
    const section = sectionsRef.current.find((s) => s.id === note.section_id);
    if (!section) return;
    const before = section.notes;
    const reordered = resequenceNotes(
      sortNotesByDone(
        before.map((n) => (n.id === note.id ? { ...n, done } : n)),
        note.id
      )
    );
    setNotes(note.section_id, reordered);
    clearSettling(note.id);
    await saveOrder(before, reordered);
  }

  async function deleteNote(note: Note) {
    markNotePending(note.id, true);
    await supabase.from("notes").delete().eq("id", note.id);
    setSections((prev) =>
      prev.map((s) => (s.id === note.section_id ? { ...s, notes: s.notes.filter((n) => n.id !== note.id) } : s))
    );
    markNotePending(note.id, false);
  }

  async function deleteSection(id: string) {
    markSectionPending(id, true);
    await supabase.from("note_sections").delete().eq("id", id);
    setSections((prev) => prev.filter((s) => s.id !== id));
    markSectionPending(id, false);
  }

  return (
    <section>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            editable={editable}
            busy={pendingSections.has(s.id)}
            saving={savingSections.has(s.id)}
            pendingNotes={pendingNotes}
            settling={settling}
            onAdd={(c) => addNote(s.id, c)}
            onToggle={toggleNote}
            onDeleteNote={deleteNote}
            onDeleteSection={() => deleteSection(s.id)}
            onSaveBody={(body) => saveSectionBody(s.id, body)}
          />
        ))}
        {sections.length === 0 && <p className="text-sm text-ink/40">No sections yet.</p>}
      </div>
      {editable && (
        <div className="mt-4 max-w-sm">
          <div className="flex gap-2">
            <input
              value={newSection}
              onChange={(e) => {
                setNewSection(e.target.value);
                if (sectionHint) setSectionHint(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && addSection()}
              placeholder="New section, e.g. Packing list"
              disabled={addingSection}
              aria-invalid={sectionHint}
              className="field flex-1"
            />
            <button onClick={addSection} disabled={addingSection} className="btn-secondary">
              {addingSection ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon className="h-4 w-4" />}
              Add
            </button>
          </div>
          <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Section type">
            {(
              [
                ["checklist", "Checklist"],
                ["freeform", "Free-form notes"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={newKind === value}
                onClick={() => setNewKind(value)}
                disabled={addingSection}
                className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                  newKind === value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-ink/15 text-ink/50 hover:border-ink/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {sectionHint && (
            <p className="mt-1.5 text-xs text-red-600">Give the section a name first.</p>
          )}
        </div>
      )}
    </section>
  );
}

function SectionCard({
  section,
  editable,
  busy,
  saving,
  pendingNotes,
  settling,
  onAdd,
  onToggle,
  onDeleteNote,
  onDeleteSection,
  onSaveBody
}: {
  section: NoteSection;
  editable: boolean;
  busy: boolean;
  saving: boolean;
  pendingNotes: Set<string>;
  settling: Map<string, boolean>;
  onAdd: (content: string) => Promise<boolean>;
  onToggle: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
  onDeleteSection: () => void;
  onSaveBody: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  // Notes that never reached the server, kept on screen so the typed text is
  // not lost along with the cleared field.
  const [unsaved, setUnsaved] = useState<{ key: number; content: string }[]>([]);
  const nextKey = useRef(0);
  const rowRef = useSlideOnReorder<HTMLLIElement>();
  const freeform = section.kind === "freeform";

  async function save(content: string) {
    if (await onAdd(content)) return;
    setUnsaved((prev) => [...prev, { key: nextKey.current++, content }]);
  }

  function submitNote() {
    const content = draft.trim();
    if (!content) return;
    // Clear the field at once — but never disable it — so the next note can be
    // typed straight away while this one is on its way to the server.
    setDraft("");
    void save(content);
  }

  function retryNote(entry: { key: number; content: string }) {
    setUnsaved((prev) => prev.filter((u) => u.key !== entry.key));
    void save(entry.content);
  }
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{section.title}</h3>
        {editable && (
          <button
            onClick={onDeleteSection}
            disabled={busy}
            title="Remove section"
            className="flex items-center gap-1.5 text-xs text-ink/40 transition-colors hover:text-red-600 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3 w-3" /> : <TrashIcon className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {freeform ? (
        <FreeformBody
          key={section.id}
          value={section.body ?? ""}
          editable={editable}
          onSave={onSaveBody}
        />
      ) : (
      <>
      <ul className="space-y-1.5">
        {/* Sort on render too, so sections saved before this ordering existed
            (and any stale server snapshot) still show ticked notes last. */}
        {sortNotesByDone(section.notes).map((n) => {
          const notePending = pendingNotes.has(n.id);
          // While a note is settling its new state is shown here, ahead of the
          // note itself, so the tick lands before the row travels.
          const done = settling.get(n.id) ?? n.done;
          return (
            <li key={n.id} ref={rowRef(n.id)} className="group flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={done}
                onChange={() => editable && onToggle(n)}
                disabled={!editable || notePending}
                className="mt-0.5 accent-accent"
              />
              <span
                className={`transition-colors duration-200 ${done ? "text-ink/35 line-through" : ""}`}
              >
                {n.content}
              </span>
              {notePending && <Spinner className="h-3 w-3 text-ink/30" />}
              {editable && !notePending && (
                <button
                  onClick={() => onDeleteNote(n)}
                  aria-label="Delete note"
                  // Touch devices have no hover, so a `group-hover`-revealed
                  // button would make the first tap on a note only trigger the
                  // row's :hover (revealing this button) instead of toggling the
                  // checkbox — forcing a second tap. Gate the hide-until-hover
                  // behaviour behind `@media (hover: hover)` so it stays visible
                  // on touch and the checkbox toggles on the very first tap.
                  className="ml-auto text-ink/30 transition-colors hover:text-red-600 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // Not `disabled` while a note saves: the browser blurs a disabled
              // field, and everything typed until it comes back is swallowed.
              onKeyDown={(e) => e.key === "Enter" && submitNote()}
              placeholder="Type a note…"
              className="w-full flex-1 rounded-xl border border-transparent bg-ink/5 p-2 text-base sm:text-sm outline-none transition-colors focus:border-accent/40 focus:bg-surface"
            />
            {draft.trim() ? (
              <button onClick={submitNote} aria-label="Add note" className="btn-secondary shrink-0">
                {saving ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon className="h-4 w-4" />}
                Add
              </button>
            ) : (
              // The field is no longer dimmed while a note saves, so the
              // progress has to show somewhere once the draft is cleared.
              saving && (
                <span role="status" aria-label="Saving note" className="flex shrink-0 items-center px-1">
                  <Spinner className="h-3.5 w-3.5 text-ink/30" />
                </span>
              )
            )}
          </div>
          {unsaved.map((u) => (
            <div
              key={u.key}
              role="alert"
              className="mt-1.5 flex items-center gap-2 text-xs text-red-600"
            >
              <span className="min-w-0 flex-1 truncate">Not saved: “{u.content}”</span>
              <button onClick={() => retryNote(u)} className="shrink-0 underline">
                Retry
              </button>
              <button
                onClick={() => setUnsaved((prev) => prev.filter((p) => p.key !== u.key))}
                aria-label="Discard unsaved note"
                className="shrink-0 text-ink/30 transition-colors hover:text-red-600"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </>
      )}
      </>
      )}
    </div>
  );
}

// Free-form text block for a "freeform" section. Keeps a local draft so typing
// stays snappy, and saves after a short pause (and on blur) rather than on every
// keystroke. Read-only viewers see the text without an editable field.
function FreeformBody({
  value,
  editable,
  onSave
}: {
  value: string;
  editable: boolean;
  onSave: (body: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const savedRef = useRef(value);

  // Reflect external changes (e.g. a fresh server load) when the field isn't
  // being actively edited away from the saved value.
  useEffect(() => {
    if (draft === savedRef.current) {
      setDraft(value);
      savedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function flush() {
    if (draft !== savedRef.current) {
      savedRef.current = draft;
      onSave(draft);
    }
  }

  useEffect(() => {
    if (!editable || draft === savedRef.current) return;
    const t = setTimeout(flush, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editable]);

  if (!editable) {
    return value.trim() ? (
      <p className="whitespace-pre-wrap text-sm text-ink/80">{value}</p>
    ) : (
      <p className="text-sm text-ink/40">No notes yet.</p>
    );
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      placeholder="Write your notes…"
      rows={4}
      className="w-full resize-y rounded-xl border border-transparent bg-ink/5 p-2 text-base sm:text-sm outline-none transition-colors focus:border-accent/40 focus:bg-surface"
    />
  );
}

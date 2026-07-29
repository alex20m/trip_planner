"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note, NoteSection, NoteSectionKind } from "@/lib/types";
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
  const supabase = createClient();

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

  async function addNote(sectionId: string, content: string) {
    if (!content.trim() || pendingSections.has(sectionId)) return;
    markSectionPending(sectionId, true);
    const section = sections.find((s) => s.id === sectionId)!;
    const { data } = await supabase
      .from("notes")
      .insert({ section_id: sectionId, content: content.trim(), sort_order: section.notes.length })
      .select()
      .single();
    if (data)
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, notes: [...s.notes, data as Note] } : s))
      );
    markSectionPending(sectionId, false);
  }

  // Optimistic: check/uncheck instantly (no spinner), roll back if the server rejects it.
  async function toggleNote(note: Note) {
    const setDone = (done: boolean) =>
      setSections((prev) =>
        prev.map((s) =>
          s.id === note.section_id
            ? { ...s, notes: s.notes.map((n) => (n.id === note.id ? { ...n, done } : n)) }
            : s
        )
      );
    setDone(!note.done);
    const { error } = await supabase.from("notes").update({ done: !note.done }).eq("id", note.id);
    if (error) setDone(note.done);
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
            pendingNotes={pendingNotes}
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
  pendingNotes,
  onAdd,
  onToggle,
  onDeleteNote,
  onDeleteSection,
  onSaveBody
}: {
  section: NoteSection;
  editable: boolean;
  busy: boolean;
  pendingNotes: Set<string>;
  onAdd: (content: string) => void;
  onToggle: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
  onDeleteSection: () => void;
  onSaveBody: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const freeform = section.kind === "freeform";
  function submitNote() {
    if (!draft.trim() || busy) return;
    onAdd(draft);
    setDraft("");
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
        {section.notes.map((n) => {
          const notePending = pendingNotes.has(n.id);
          return (
            <li key={n.id} className="group flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={n.done}
                onChange={() => editable && onToggle(n)}
                disabled={!editable || notePending}
                className="mt-0.5 accent-accent"
              />
              <span className={n.done ? "text-ink/35 line-through" : ""}>{n.content}</span>
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
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNote()}
            placeholder="Type a note…"
            disabled={busy}
            className="w-full flex-1 rounded-xl border border-transparent bg-ink/5 p-2 text-base sm:text-sm outline-none transition-colors focus:border-accent/40 focus:bg-surface disabled:opacity-50"
          />
          {draft.trim() && (
            <button
              onClick={submitNote}
              disabled={busy}
              aria-label="Add note"
              className="btn-secondary shrink-0"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon className="h-4 w-4" />}
              Add
            </button>
          )}
        </div>
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

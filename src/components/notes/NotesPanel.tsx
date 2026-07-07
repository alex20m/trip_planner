"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note, NoteSection } from "@/lib/types";
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
  const [addingSection, setAddingSection] = useState(false);
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
    if (!newSection.trim() || addingSection) return;
    setAddingSection(true);
    const { data } = await supabase
      .from("note_sections")
      .insert({ trip_id: tripId, title: newSection.trim(), sort_order: sections.length })
      .select()
      .single();
    if (data) setSections((prev) => [...prev, { ...data, notes: [] }]);
    setNewSection("");
    setAddingSection(false);
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

  async function toggleNote(note: Note) {
    markNotePending(note.id, true);
    await supabase.from("notes").update({ done: !note.done }).eq("id", note.id);
    setSections((prev) =>
      prev.map((s) =>
        s.id === note.section_id
          ? { ...s, notes: s.notes.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)) }
          : s
      )
    );
    markNotePending(note.id, false);
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
          />
        ))}
        {sections.length === 0 && <p className="text-sm text-ink/40">No sections yet.</p>}
      </div>
      {editable && (
        <div className="mt-4 flex max-w-sm gap-2">
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSection()}
            placeholder="New section, e.g. Packing list"
            disabled={addingSection}
            className="field flex-1 text-sm"
          />
          <button onClick={addSection} disabled={addingSection} className="btn-secondary">
            {addingSection ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon className="h-4 w-4" />}
            Add
          </button>
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
  onDeleteSection
}: {
  section: NoteSection;
  editable: boolean;
  busy: boolean;
  pendingNotes: Set<string>;
  onAdd: (content: string) => void;
  onToggle: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
  onDeleteSection: () => void;
}) {
  const [draft, setDraft] = useState("");
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
                  className="ml-auto hidden text-ink/30 transition-colors hover:text-red-600 group-hover:block"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              onAdd(draft);
              setDraft("");
            }
          }}
          placeholder="Type and press Enter…"
          disabled={busy}
          className="mt-2 w-full rounded-xl border border-transparent bg-ink/5 p-2 text-sm outline-none transition-colors focus:border-accent/40 focus:bg-surface disabled:opacity-50"
        />
      )}
    </div>
  );
}

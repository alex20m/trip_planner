-- Note sections can now be one of two kinds:
--   'checklist' — the existing tick-box list of individual notes (default), or
--   'freeform'  — a single free-form text block stored in `body`.
-- Existing sections default to 'checklist' so current behaviour is unchanged.
-- `body` is only used by freeform sections; checklist sections keep their notes
-- in the `notes` table as before.
alter table public.note_sections
  add column kind text not null default 'checklist'
    check (kind in ('checklist', 'freeform')),
  add column body text;

-- Let activity/travel events be marked all-day (no specific time), the same
-- way accommodation already behaves. Existing rows default to false so
-- current timed events are unaffected.
alter table public.trip_events
  add column all_day boolean not null default false;

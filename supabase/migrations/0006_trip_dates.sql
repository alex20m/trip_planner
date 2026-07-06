-- Trips get an explicit start/end date, set at creation and editable afterwards.
-- The planner is scoped to this range instead of scrolling indefinitely.

alter table public.trips
  add column start_date date not null default current_date,
  add column end_date date not null default (current_date + 6);

alter table public.trips
  add constraint trip_end_after_start check (end_date >= start_date);

-- Event times are wall-clock times, not instants.
--
-- "Dinner at 19:00" means 19:00 on the clock on the wall — at home, on the
-- plane, and after landing three timezones away. Storing these as timestamptz
-- made Postgres and the client agree on an *instant* instead, and the app then
-- rendered that instant in whatever zone the device happened to be in. The two
-- conversions cancel out only while the device stays in the zone the event was
-- created in; travelling abroad shifted every time in the trip.
--
-- `timestamp` (without time zone) stores exactly the calendar fields it is
-- given and hands them back unchanged, so the invariant now holds in the
-- database itself and no future client can reintroduce the drift. An inbound
-- value that still carries a "Z" (as the app sends) keeps its calendar fields:
-- Postgres ignores the offset when casting to `timestamp`.
--
-- Backfill of existing rows
-- -------------------------
-- Timed rows hold an instant that was derived from the author's local clock,
-- so recovering the time as typed means reading that instant back in the zone
-- it was typed in. These trips were planned in Finland, so that zone is
-- Europe/Helsinki; change the constant below before running this if your rows
-- were authored elsewhere. (The conversion is DST-correct — Postgres uses the
-- offset in effect on each row's own date.)
--
-- All-day rows (accommodation, plus anything flagged all_day) were already
-- written at UTC midnight on purpose, so they convert from UTC and keep their
-- date exactly.

alter table public.trip_events
  alter column start_at type timestamp
    using (
      start_at at time zone
        (case when all_day or type = 'accommodation' then 'UTC' else 'Europe/Helsinki' end)
    ),
  alter column end_at type timestamp
    using (
      end_at at time zone
        (case when all_day or type = 'accommodation' then 'UTC' else 'Europe/Helsinki' end)
    );

comment on column public.trip_events.start_at is
  'Wall-clock start, exactly as entered. Never convert this through a timezone.';
comment on column public.trip_events.end_at is
  'Wall-clock end, exactly as entered. Never convert this through a timezone.';

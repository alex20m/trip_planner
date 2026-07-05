-- Calendar sync: per-trip token for .ics subscription + updated_at so that
-- subscribing calendars update changed events.

alter table public.trips
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists trips_calendar_token_idx
  on public.trips(calendar_token);

alter table public.trip_events
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trip_events_touch on public.trip_events;
create trigger trip_events_touch before update on public.trip_events
  for each row execute function public.touch_updated_at();

-- Rotate token: a member can generate a new one and thereby revoke the old
-- subscription link (e.g. if it leaked).
create or replace function public.rotate_calendar_token(p_trip uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_token uuid;
begin
  if my_role(p_trip) is null then
    raise exception 'You are not a member of this trip';
  end if;
  new_token := gen_random_uuid();
  update trips set calendar_token = new_token where id = p_trip;
  return new_token;
end;
$$;

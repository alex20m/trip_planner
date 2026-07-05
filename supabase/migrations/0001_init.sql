-- PlanPal schema. Run the whole file in the Supabase SQL Editor.

create type trip_role as enum ('owner', 'edit', 'read');
create type event_type as enum ('activity', 'travel', 'accommodation');
create type invite_status as enum ('pending', 'accepted', 'declined');

-- ---------------------------------------------------------------- tables

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role trip_role not null default 'read',
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  type event_type not null default 'activity',
  start_at timestamptz not null,
  end_at timestamptz,          -- optional
  location text,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint end_after_start check (end_at is null or end_at >= start_at)
);
create index on public.trip_events (trip_id, start_at);

create table public.note_sections (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.note_sections(id) on delete cascade,
  content text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text not null,
  role trip_role not null default 'read',
  invited_by uuid not null references auth.users(id),
  token uuid not null unique default gen_random_uuid(),
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint no_owner_invites check (role <> 'owner')
);
create index on public.trip_invites (trip_id);

-- ---------------------------------------------------------------- helpers

create or replace function public.role_rank(r trip_role)
returns int language sql immutable as $$
  select case r when 'owner' then 3 when 'edit' then 2 when 'read' then 1 end;
$$;

-- The role the signed-in user has in a trip (null = not a member).
-- SECURITY DEFINER to avoid RLS recursion against trip_members.
create or replace function public.my_role(p_trip uuid)
returns trip_role language sql stable security definer set search_path = public as $$
  select role from trip_members where trip_id = p_trip and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- triggers

-- The owner automatically becomes a member with the owner role.
create or replace function public.add_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger trips_add_owner after insert on public.trips
  for each row execute function public.add_owner_member();

-- Core rule: you can share on at most with the same access you have yourself.
create or replace function public.enforce_invite_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare inviter trip_role;
begin
  inviter := my_role(new.trip_id);
  if inviter is null then
    raise exception 'You are not a member of this trip';
  end if;
  if role_rank(new.role) > role_rank(inviter) then
    raise exception 'You cannot share with higher access than your own (%).', inviter;
  end if;
  new.invited_by := auth.uid();
  return new;
end;
$$;
create trigger invites_enforce_role before insert on public.trip_invites
  for each row execute function public.enforce_invite_role();

-- ---------------------------------------------------------------- RPC: accept

-- Signed-in user accepts with a token. Never gets a higher role than the invite.
create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv trip_invites%rowtype;
begin
  select * into inv from trip_invites where token = p_token and status = 'pending';
  if not found then
    raise exception 'Invitation not found or already answered';
  end if;
  insert into trip_members (trip_id, user_id, role)
    values (inv.trip_id, auth.uid(), inv.role)
    on conflict (trip_id, user_id) do update
      set role = case
        when role_rank(excluded.role) > role_rank(trip_members.role)
        then excluded.role else trip_members.role end;
  update trip_invites set status = 'accepted' where id = inv.id;
  return inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_events enable row level security;
alter table public.note_sections enable row level security;
alter table public.notes enable row level security;
alter table public.trip_invites enable row level security;

-- trips
create policy trips_select on public.trips for select
  using (my_role(id) is not null);
create policy trips_insert on public.trips for insert
  with check (owner_id = auth.uid());
create policy trips_update on public.trips for update
  using (my_role(id) = 'owner');
create policy trips_delete on public.trips for delete
  using (my_role(id) = 'owner');

-- trip_members
create policy members_select on public.trip_members for select
  using (my_role(trip_id) is not null);
create policy members_delete on public.trip_members for delete
  using (my_role(trip_id) = 'owner' or user_id = auth.uid());

-- trip_events: read may read, edit/owner may write
create policy events_select on public.trip_events for select
  using (my_role(trip_id) is not null);
create policy events_write on public.trip_events for insert
  with check (role_rank(my_role(trip_id)) >= 2);
create policy events_update on public.trip_events for update
  using (role_rank(my_role(trip_id)) >= 2);
create policy events_delete on public.trip_events for delete
  using (role_rank(my_role(trip_id)) >= 2);

-- note_sections
create policy sections_select on public.note_sections for select
  using (my_role(trip_id) is not null);
create policy sections_write on public.note_sections for insert
  with check (role_rank(my_role(trip_id)) >= 2);
create policy sections_update on public.note_sections for update
  using (role_rank(my_role(trip_id)) >= 2);
create policy sections_delete on public.note_sections for delete
  using (role_rank(my_role(trip_id)) >= 2);

-- notes (via sektionens trip)
create or replace function public.section_trip(p_section uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select trip_id from note_sections where id = p_section;
$$;

create policy notes_select on public.notes for select
  using (my_role(section_trip(section_id)) is not null);
create policy notes_write on public.notes for insert
  with check (role_rank(my_role(section_trip(section_id))) >= 2);
create policy notes_update on public.notes for update
  using (role_rank(my_role(section_trip(section_id))) >= 2);
create policy notes_delete on public.notes for delete
  using (role_rank(my_role(section_trip(section_id))) >= 2);

-- trip_invites: alla medlemmar ser inbjudningar; insert valideras av triggern
create policy invites_select on public.trip_invites for select
  using (my_role(trip_id) is not null);
create policy invites_insert on public.trip_invites for insert
  with check (my_role(trip_id) is not null);
create policy invites_delete on public.trip_invites for delete
  using (invited_by = auth.uid() or my_role(trip_id) = 'owner');

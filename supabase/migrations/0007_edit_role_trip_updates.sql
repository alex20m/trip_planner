-- Roles: owner and edit can make all edits within a trip (including its
-- name and date range on the trips row itself); read stays view-only and
-- deleting the trip stays owner-only (trips_delete is unchanged).

drop policy trips_update on public.trips;
create policy trips_update on public.trips for update
  using (role_rank(my_role(id)) >= 2);

-- Widening UPDATE beyond the owner must not let editors reassign ownership
-- or overwrite the calendar token. Column-level privileges are checked
-- before RLS, so restrict API updates to the editable detail columns.
-- Token rotation still works for every member: rotate_calendar_token() is
-- SECURITY DEFINER and bypasses this grant.
revoke update on table public.trips from authenticated;
grant update (name, start_date, end_date) on table public.trips to authenticated;

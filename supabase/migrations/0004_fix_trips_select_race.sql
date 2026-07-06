-- INSERT ... RETURNING must satisfy the table's SELECT policy, but the
-- trips_add_owner AFTER INSERT trigger (which grants the creator an 'owner'
-- row in trip_members) doesn't run until after that check, so the previous
-- trips_select policy rejected every trip creation with "new row violates
-- row-level security policy for table trips". Allow the owner through
-- directly so trip creation doesn't depend on trigger timing.

drop policy trips_select on public.trips;
create policy trips_select on public.trips for select
  using (owner_id = auth.uid() or my_role(id) is not null);

-- 0003_grants.sql granted the API roles table/function privileges but only
-- covered "authenticated". service_role hit the same "recent Supabase
-- defaults no longer auto-expose tables to API roles" issue: BYPASSRLS
-- skips row-level filtering but not the ordinary GRANT check, so the
-- calendar/.ics feed's service-role read of public.trips (via PostgREST)
-- was failing with "permission denied for schema public" and being treated
-- as a 404 by the route (it only checks whether a row came back).

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Recent Supabase projects no longer auto-expose new tables/functions to the
-- API roles — table-level GRANTs are required in addition to RLS policies.
-- Without these, every request hits "permission denied" before RLS is even
-- evaluated, regardless of how permissive the policies are.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Apply the same privileges to anything added by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

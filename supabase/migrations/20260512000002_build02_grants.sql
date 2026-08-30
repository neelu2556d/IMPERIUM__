-- PATCH04: Grant table-level permissions for BUILD02 tables.
--
-- Root cause: raw SQL CREATE TABLE does not auto-grant anon/authenticated/service_role
-- the way Supabase dashboard does. RLS policies are irrelevant until the role has the
-- basic table privilege — the DB rejects with "permission denied for table X" before
-- even evaluating policies.
--
-- Run this in the Supabase SQL editor for project <your-project-ref>.

grant select, insert, update, delete on table public.user_profile      to anon, authenticated, service_role;
grant select, insert, update, delete on table public.weights            to anon, authenticated, service_role;
grant select, insert, update, delete on table public.water_log          to anon, authenticated, service_role;
grant select, insert, update, delete on table public.supplements_stack  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.wearable_connections to anon, authenticated, service_role;
grant select, insert, update, delete on table public.wearable_data      to anon, authenticated, service_role;
grant select, insert, update, delete on table public.training_settings  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.workouts           to anon, authenticated, service_role;

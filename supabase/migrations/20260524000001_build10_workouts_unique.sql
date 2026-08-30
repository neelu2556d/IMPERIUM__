-- BUILD10 — workouts uniqueness for upsert
--
-- The workouts table (BUILD02) was created without a unique constraint
-- on (user_id, date, day_name). SplitLog wires continuous auto-save via
-- upsert(onConflict: 'user_id,date,day_name') — that needs a unique
-- index to dispatch the conflict resolution.
--
-- Behavioural decision: one workout row per (user, date, day_name).
-- A user can still log multiple sessions on the same date by visiting
-- different days from the rotation (Push then Pull on Monday); each
-- has a distinct day_name. The rare "I did Push twice on Monday"
-- case overwrites — acceptable.

-- Wrapped in a DO block so re-running this migration on a database that
-- already has the constraint is a no-op rather than an error. PostgreSQL
-- doesn't support `add constraint ... if not exists` natively.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workouts_user_date_day_unique'
      and conrelid = 'public.workouts'::regclass
  ) then
    alter table public.workouts
      add constraint workouts_user_date_day_unique
      unique (user_id, date, day_name);
  end if;
end $$;

-- Optional end-of-session cardio, stored on the workouts row.
--
-- One JSONB array of cardio bouts per logged session, e.g.
--   [{ "type": "walk", "label": "Walk", "durationMin": 30, "zone2Min": 25 }]
--
-- Nullable so existing rows and lift-only sessions are unaffected. RLS on
-- public.workouts already scopes reads/writes to auth.uid(); a new column on
-- the same row needs no extra policy.

alter table public.workouts
  add column if not exists cardio jsonb;

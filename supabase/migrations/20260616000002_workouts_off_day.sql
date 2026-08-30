-- Off-day / readiness marker on a logged session.
--
-- When the user trains on a low-readiness day (tired, sick, drained), they pick
-- a level in the logger's readiness sheet. We ease the day's load AND keep that
-- session off the progress graph so an off day never dents their baseline.
--
-- Stored as a short text level on the workouts row:
--   'little' = a little off (light back-off)
--   'rough'  = pretty rough (sick / drained but still showing up)
--   null     = a normal session
--
-- Nullable so existing rows and normal sessions are unaffected. RLS on
-- public.workouts already scopes reads/writes to auth.uid(); a new column on
-- the same row needs no extra policy.

alter table public.workouts
  add column if not exists off_day text;

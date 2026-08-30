-- ============================================================
-- Per-user custom exercises.
--
-- custom_exercises — jsonb [ { "id": "custom_<uuid>", "name": "Barbell pause reps" } ]
--
-- When a lift isn't in the static EX library, the user can add their own from
-- the "Add a lift" sheet. The definition is saved here (per user, RLS-scoped via
-- the existing training_settings row) so it's reusable across days: it shows up
-- in the add-picker search every session, and — because workout history is keyed
-- by exercise id — a stable custom id accumulates history week to week just like
-- a built-in lift. Name only for now (the picker is search-driven, no muscle
-- needed); a muscle field can be added later without a migration (additive JSON).
--
-- Additive + idempotent. No backfill — absent column / empty array means the
-- user simply has no custom lifts yet, so existing accounts are unaffected.
-- ============================================================

alter table public.training_settings
  add column if not exists custom_exercises jsonb not null default '[]'::jsonb;

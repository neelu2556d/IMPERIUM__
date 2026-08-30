-- ============================================================
-- Per-lift rest-timer overrides.
--
-- rest_overrides — jsonb { `${exerciseId}__${dayType}`: seconds }
--
-- Mirrors the recommended_weights model: keyed by exercise id + day type, so a
-- saved rest time FOLLOWS the exercise across splits (re-running setup keeps
-- it) and HEAVY vs VOLUME keep their own values. The Tune sheet
-- (ExerciseSettings) reads/writes it; SplitLog's rest timer prefers it over the
-- tier×day-type default in REST_SEC. Empty default = fall back to REST_SEC.
--
-- Additive + idempotent. No backfill needed — absent keys fall back to the
-- computed default, so existing users are unaffected.
-- ============================================================

alter table public.training_settings
  add column if not exists rest_overrides jsonb not null default '{}'::jsonb;

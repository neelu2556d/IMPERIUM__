-- BUILD17 — Persist the tailored-intake answers + computed recommendation
-- on training_settings so the diagnostic card and the "Completed" badge
-- on the setup wizard's launcher survive page refresh / new device.
--
-- Both columns are nullable jsonb. Existing rows pre-BUILD17 simply have
-- nulls — the wizard treats null as "intake not taken yet" and renders
-- the empty-state launcher.
--
-- intake_answers — raw IntakeAnswers from IntakeQuiz (the 11 selections)
-- intake_rec     — computed IntakeRecommendation (preset id, name,
--                  diagnostic line, reasoning bullets, alternatives)

alter table public.training_settings
  add column if not exists intake_answers jsonb,
  add column if not exists intake_rec     jsonb;

-- No new RLS policy needed — existing per-user policies already cover
-- all columns of the row.

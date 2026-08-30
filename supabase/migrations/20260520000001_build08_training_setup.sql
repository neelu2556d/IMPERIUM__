-- ============================================================
-- BUILD08 — Training setup (fitness module onboarding)
-- ============================================================
-- Extend training_settings with the fitness module's setup data:
--   gym_level         — beginner / intermediate / advanced
--   recommended_weights — jsonb { exerciseId: weight_kg }
--   setup_complete    — boolean gating flag
--
-- The user fills these via the /app/fitness/setup wizard. Until
-- setup_complete = true, /app/fitness/log redirects there. The
-- TAILOR_TABLE computation runs server-side in a server action
-- and writes the resulting recommended_weights blob here.
--
-- ⚠️  APPLY MANUALLY in the Supabase SQL editor for project
--    <your-project-ref>. The migration is idempotent (`if not
--    exists`) so re-running is safe.
-- ============================================================

alter table public.training_settings
  add column if not exists gym_level text
    check (gym_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists recommended_weights jsonb not null default '{}'::jsonb,
  add column if not exists setup_complete boolean not null default false;

create index if not exists training_settings_setup_complete_idx
  on public.training_settings (user_id, setup_complete);

-- Grant statements aren't needed for new columns on an existing table —
-- the original GRANTs on the table cover all columns, including new ones.

-- BUILD23 · user_profile.preferences
--
-- Adds a single JSONB column that stores the user's answers to the
-- tailoring quizzes (Vitality Goal / Mentor Voice / Hydration /
-- Supplements / Peak — and any future quizzes). One column, one
-- source of truth, per-quiz slice keyed by quiz id.
--
-- Schema (TypeScript-ish, JSONB is permissive — slices added over
-- time without further migrations):
--
--   preferences: {
--     goal?: {
--       outcome: 'cut' | 'recomp' | 'bulk' | 'maintain' | 'longevity'
--       window: '30' | '60' | '90' | '180' | 'open'
--       constraint: 'time' | 'equipment' | 'motivation' | 'injury' | 'none'
--       completed_at: ISO timestamp
--     }
--     mentor?: {
--       tone: 'direct' | 'encouraging' | 'data_driven' | 'socratic'
--       focus: ('fitness' | 'business' | 'habits' | 'life' | 'recovery')[]
--       memory_notes: string  (free text the AI keeps as context)
--       completed_at: ISO timestamp
--     }
--     hydration?: {
--       daily_target_oz: number
--       caffeine_load: 'none' | 'light' | 'moderate' | 'heavy'
--       workout_days: number  (0-7)
--       completed_at: ISO timestamp
--     }
--   }
--
-- Default '{}' so existing rows are valid the moment the column lands;
-- consumers always check for slice presence before reading fields.
--
-- RLS is inherited from user_profile (each user reads/writes their
-- own row only) — no additional policy needed.

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profile.preferences IS
  'Per-quiz answer slices keyed by quiz id (goal/mentor/hydration/etc.). See BUILD23 migration for schema.';

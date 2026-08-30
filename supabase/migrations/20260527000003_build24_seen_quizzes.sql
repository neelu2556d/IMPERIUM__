-- BUILD24 · user_profile.seen_quizzes
--
-- Tracks which tailoring quizzes a user has been NOTIFIED about. Used
-- by the dashboard's "new quiz available" gem greeting to fire exactly
-- once per user per newly-shipped quiz.
--
-- Distinct from `preferences` (which stores quiz ANSWERS):
--   - seen_quizzes: ['mentor', 'goal']  → "we've shown you these,
--                                          don't pop the greeting again"
--   - preferences.mentor: {...}         → "user actually completed it"
--
-- A user can be marked "seen" without completing — they clicked
-- "maybe later" on the greeting. The checklist still shows the row
-- as pending; we just don't re-pop the gem modal at them.
--
-- NULL on existing rows = "never run the notify backfill for this
-- user yet." The backfill pass treats first-time NULL specifically:
-- it seeds seen_quizzes with the FULL current registry so existing
-- users don't get nudged about quizzes that were already live when
-- they signed up. Only future-added quizzes will pop the greeting.
--
-- RLS inherited from user_profile.

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS seen_quizzes TEXT[] DEFAULT NULL;

COMMENT ON COLUMN user_profile.seen_quizzes IS
  'Quiz ids the user has been notified about. NULL = first-time, backfill on next read with full registry. See BUILD24.';

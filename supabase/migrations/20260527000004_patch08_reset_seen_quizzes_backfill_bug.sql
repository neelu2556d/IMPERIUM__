-- PATCH08 — Heal rows hit by the first-run backfill footgun in
-- lib/quizzes/notify.ts. The original logic seeded `seen_quizzes`
-- with the FULL quiz registry on first /app load, which suppressed
-- the gem greeting modal for anyone who hadn't taken those quizzes
-- yet. Fix: clear `seen_quizzes` for rows where the preferences
-- JSONB doesn't contain ANY of the listed slices (i.e., the user
-- has never completed a quiz, so any non-null seen list there is
-- the backfill, not real history).
--
-- Idempotent: re-running it on a healed row is a no-op since the
-- WHERE clause filters them out.

UPDATE user_profile
SET seen_quizzes = NULL,
    updated_at   = now()
WHERE seen_quizzes IS NOT NULL
  AND array_length(seen_quizzes, 1) > 0
  AND NOT (
    coalesce(preferences ? 'goal', false)
    OR coalesce(preferences ? 'mentor', false)
    OR coalesce(preferences ? 'hydration', false)
  );

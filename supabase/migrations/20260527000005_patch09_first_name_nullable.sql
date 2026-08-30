-- PATCH09 — Drop NOT NULL on user_profile.first_name.
--
-- The personal-info quiz fills first_name during onboarding, but other
-- writes hit the table BEFORE that quiz runs — e.g., saveQuizSlice for
-- the Goal/Mentor/Hydration tailoring quizzes, which the user can
-- complete in any order. Those upserts INSERT a fresh row when none
-- exists, and the NOT NULL constraint blocked the insert with:
--
--   "null value in column \"first_name\" of relation \"user_profile\"
--    violates not-null constraint"
--
-- Making it nullable is the right call: the column is informational
-- (greeting copy uses "friend" as fallback when missing) and was never
-- a hard data-integrity invariant. The personal-info quiz still fills
-- it for users who go through that flow.

ALTER TABLE user_profile ALTER COLUMN first_name DROP NOT NULL;

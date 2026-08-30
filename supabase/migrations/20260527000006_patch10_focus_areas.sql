-- PATCH10 — Replace the gym-coded `goal` onboarding question with a
-- broader multi-domain `focus_areas` multi-select.
--
-- The first-impression problem: the original onboarding's last
-- question was "What's your goal?" with options like cut/recomp/bulk —
-- pure body composition language. New users saw that as the WHOLE
-- product and walked away thinking Vitality was a fitness app.
-- Vitality is actually a life-dashboard with brand, finance, peak,
-- mentor, goals modules in addition to fitness.
--
-- New question covers all module clusters: body, mind, performance,
-- brand/income, money. Multi-select (cap 3) lets the user signal
-- which clusters their dashboard should prioritize.
--
-- The Goal tailoring quiz on the /welcome checklist still asks the
-- cut/recomp/bulk question for users who pick "Get in shape" — body
-- composition lives in `preferences.goal.outcome` now, not the
-- hard column.

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS focus_areas text[];

-- Goal column stays for backward compat with existing rows, but is
-- no longer required for new onboarding completions. The check
-- constraint already allows NULL (CHECK only fires on non-null
-- values), so we just need to drop the NOT NULL.
ALTER TABLE user_profile ALTER COLUMN goal DROP NOT NULL;

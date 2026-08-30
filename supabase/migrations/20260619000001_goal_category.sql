-- Goal triage (BUILD47): two additive columns on the big-goals table.
--   category    — one of the nine buckets (fitness/health/mind/money/career/
--                 craft/audience/people/general). Free text; the app clamps it.
--   clean_title — the AI-tidied professional restatement of the user's title.
-- Both nullable + backfilled by the app (lib/goals/categorize.ts), so existing
-- goals stay valid and the feature is purely additive.

alter table public.vitality_goals add column if not exists category   text;
alter table public.vitality_goals add column if not exists clean_title text;

-- Fuel "for everyone" — diet style + skipped-setup marker.
--
-- diet_style: the user's answer to "what do you want food to do for you?" on the
-- macro setup quiz (macros / lose_fat / cut_sugar / quit_fastfood / hydrate /
-- eat_better). The deterministic food coach reads it to talk to each person in
-- their own terms instead of grading everyone on macros.
--
-- setup_skipped: true when the user chose "skip for now, I'll just log" instead
-- of finishing the quiz. They still get in (onboarded=true) on the DB's default
-- targets, with an untailored coach — the deliberate softening of the old hard
-- wall. The tracker can offer a one-tap "set my real goal" when this is true.
--
-- Both are additive + nullable so the app degrades gracefully if this has not
-- landed yet (setupActions writes them in a separate, error-tolerant update).

alter table public.nutrition_goals
  add column if not exists diet_style text,
  add column if not exists setup_skipped boolean not null default false;

comment on column public.nutrition_goals.diet_style is
  'Eater-type from the macro setup quiz; drives coach tailoring. One of macros/lose_fat/cut_sugar/quit_fastfood/hydrate/eat_better.';
comment on column public.nutrition_goals.setup_skipped is
  'True when the user skipped the setup quiz and is on default targets with an untailored coach.';

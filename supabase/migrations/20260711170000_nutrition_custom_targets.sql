-- Custom Targets editor: let users hand-set body composition and micronutrient
-- goals without redoing the macro quiz. All additive + nullable so an older app
-- build keeps deserializing (rowToGoals defaults each to null) and the write is
-- error-tolerant if this migration has not landed yet.

alter table public.nutrition_goals add column if not exists body_fat_pct numeric;
alter table public.nutrition_goals add column if not exists fiber_target numeric;
alter table public.nutrition_goals add column if not exists sugar_limit_g numeric;
alter table public.nutrition_goals add column if not exists sodium_limit_mg numeric;

comment on column public.nutrition_goals.body_fat_pct is 'User-set body fat percentage. Null means not set.';
comment on column public.nutrition_goals.fiber_target is 'Daily fiber goal in grams. Null means no goal.';
comment on column public.nutrition_goals.sugar_limit_g is 'Daily sugar limit in grams. Null means no limit set.';
comment on column public.nutrition_goals.sodium_limit_mg is 'Daily sodium limit in milligrams. Null means no limit set.';

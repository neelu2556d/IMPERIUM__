-- Macro cycling: training-day vs rest-day targets on nutrition_goals.
--
-- Additive only. Existing kcal_target/protein_target/carbs_target/fat_target stay
-- as the weekly-average / fallback target (used when cycle_enabled is false). The
-- macro setup quiz writes the cycle fields; the Fuel tracker picks today's target
-- based on training_days. RLS + GRANTs on nutrition_goals already exist (BUILD25);
-- adding columns needs no new grants.

alter table public.nutrition_goals
  add column if not exists activity_level   text,
  add column if not exists goal_outcome     text,
  add column if not exists training_days    int[]   not null default '{}',
  add column if not exists cycle_enabled    boolean not null default false,
  add column if not exists training_kcal    numeric,
  add column if not exists training_protein numeric,
  add column if not exists training_carbs   numeric,
  add column if not exists training_fat     numeric,
  add column if not exists rest_kcal        numeric,
  add column if not exists rest_protein     numeric,
  add column if not exists rest_carbs       numeric,
  add column if not exists rest_fat         numeric;

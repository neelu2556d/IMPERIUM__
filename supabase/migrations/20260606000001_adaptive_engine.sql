-- Adaptive engine persistence: the goal-rate band on nutrition_goals + the
-- weekly check-in audit / anti-nag / grace table.
--
-- Additive. The pure engine (lib/nutrition/adaptive.ts) already computes the
-- band from goal_outcome; these columns let setup persist it and let a future
-- Settings UI tune a personal band without changing the user's goal.
--
-- PROD MIGRATION DRIFT: apply via the Supabase dashboard SQL editor, do NOT
-- blind `db push` (per SKILL.md / HANDOFF). The app degrades gracefully until
-- this runs: the band write no-ops on the missing columns and the read
-- backfills the lane from goal_outcome. Raw-SQL tables need explicit GRANTs
-- (PATCH04) — nutrition_checkins includes them; the nutrition_goals columns
-- inherit that table's existing grants.

alter table public.nutrition_goals
  add column if not exists goal_rate_low_kg_wk  numeric,
  add column if not exists goal_rate_high_kg_wk numeric,
  add column if not exists adaptive_enabled     boolean not null default true;

create table if not exists public.nutrition_checkins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  week_start       date not null,                 -- local week key; one per user/week
  status           text not null,                 -- on_track / too_fast / too_slow / calibrating
  trend_rate_kg_wk numeric,
  maintenance_kcal numeric,
  avg_kcal         numeric,
  prev_kcal        numeric,                        -- target before the suggestion
  suggested_kcal   numeric,
  decision         text not null default 'pending', -- pending / accepted / dismissed / grace
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  unique (user_id, week_start)
);

create index if not exists nutrition_checkins_user_week_idx
  on public.nutrition_checkins (user_id, week_start);

alter table public.nutrition_checkins enable row level security;

-- Idempotent: drop-then-create so re-running the file does not error.
drop policy if exists "checkins read own"   on public.nutrition_checkins;
drop policy if exists "checkins insert own" on public.nutrition_checkins;
drop policy if exists "checkins update own" on public.nutrition_checkins;

create policy "checkins read own"
  on public.nutrition_checkins for select
  using (auth.uid() = user_id);

create policy "checkins insert own"
  on public.nutrition_checkins for insert
  with check (auth.uid() = user_id);

create policy "checkins update own"
  on public.nutrition_checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_checkins
  to anon, authenticated, service_role;

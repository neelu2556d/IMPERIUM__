-- Vee Goals — authoritative schema for the new two-tier Goals feature housed in
-- the Vee mentor experience, replacing the legacy localStorage /app/goals module.
--
-- Four owner-scoped tables, RLS pattern copied from 20260608000001_vitals_goals.sql:
--   1. vitality_goals       — the BIG personal goals the user authors
--   2. vitality_habit_goals — the small auto-tracked / manual "THIS WEEK" goals
--   3. goals_streak         — one row per user; preserves the rollStreak engine 1:1
--   4. goal_nudges          — drift-watch cooldown ledger (cron + on-open share it)
--
-- goals_state (the jsonb localStorage mirror, 20260615000002) is intentionally
-- LEFT IN PLACE during the transition so the current MCP getGoals() and any
-- unmigrated client keep working. It is retired in a later migration once
-- read-back + backfill are verified in prod.

-- ===========================================================================
-- TABLE 1 — public.vitality_goals  (the BIG personal goals: "hit 1,000 subs")
-- ===========================================================================
create table if not exists public.vitality_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  target_date      date,
  -- priority 1 = Low, 2 = Medium, 3 = High
  priority         smallint not null default 2 check (priority between 1 and 3),
  -- per-goal Vee push cadence — drives the drift watch in a later phase
  push_level       text not null default 'balanced'
                     check (push_level in ('silent', 'gentle', 'balanced', 'push')),
  -- optional numeric progress (current 640 of target 1000 subs). null = no bar.
  progress_current numeric(12, 2),
  progress_target  numeric(12, 2),
  progress_unit    text,
  -- single nullable identity tag ("a lifter").
  identity_tag     text,
  status           text not null default 'active'
                     check (status in ('active', 'achieved', 'paused', 'abandoned')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  achieved_at      timestamptz
);

create index if not exists vitality_goals_user_idx
  on public.vitality_goals (user_id, status, target_date);

alter table public.vitality_goals enable row level security;

create policy "users can read own vitality goals"
  on public.vitality_goals for select using (auth.uid() = user_id);
create policy "users can insert own vitality goals"
  on public.vitality_goals for insert with check (auth.uid() = user_id);
create policy "users can update own vitality goals"
  on public.vitality_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own vitality goals"
  on public.vitality_goals for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.vitality_goals to anon, authenticated, service_role;

-- ===========================================================================
-- TABLE 2 — public.vitality_habit_goals  (the small "THIS WEEK" auto/manual goals)
-- Faithful normalization of the legacy single-table Goal (kind/dueDate/parentId).
-- ===========================================================================
create table if not exists public.vitality_habit_goals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- replaces the in-blob parentId: links a habit/milestone to a big goal
  parent_goal_id      uuid references public.vitality_goals(id) on delete set null,
  title               text not null,
  kind                text not null default 'task'
                        check (kind in ('habit', 'task', 'milestone')),
  due_date            date,
  difficulty          text check (difficulty in ('red', 'yellow', 'green')),
  estimated_minutes   integer,
  suggested_start_hour numeric(4, 2),
  when_cue            text,
  -- where it came from. 'mentor' = quick-jot promote-to-goal. 'auto' = ticked from module data.
  source              text check (source in ('supplements', 'fitness', 'finance', 'mentor', 'auto')),
  -- how an auto-tracked habit is evaluated, e.g. {"metric":"train","target":4,"window":"week"}.
  -- null = manual, user-tapped.
  tracking            jsonb,
  status              text not null default 'open'
                        check (status in ('open', 'completed', 'archived')),
  -- replaces the separate tomorrow[] queue: one table, flagged.
  is_tomorrow         boolean not null default false,
  push_count          integer not null default 0,
  last_pushed_at      timestamptz,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists vitality_habit_goals_due_idx
  on public.vitality_habit_goals (user_id, due_date);
create index if not exists vitality_habit_goals_tomorrow_idx
  on public.vitality_habit_goals (user_id, is_tomorrow);
create index if not exists vitality_habit_goals_parent_idx
  on public.vitality_habit_goals (parent_goal_id);

alter table public.vitality_habit_goals enable row level security;

create policy "users can read own habit goals"
  on public.vitality_habit_goals for select using (auth.uid() = user_id);
create policy "users can insert own habit goals"
  on public.vitality_habit_goals for insert with check (auth.uid() = user_id);
create policy "users can update own habit goals"
  on public.vitality_habit_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own habit goals"
  on public.vitality_habit_goals for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.vitality_habit_goals to anon, authenticated, service_role;

-- ===========================================================================
-- TABLE 3 — public.goals_streak  (one row per user; preserves rollStreak() 1:1)
-- Columns map 1:1 onto StreakState (types.ts).
-- ===========================================================================
create table if not exists public.goals_streak (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  current            integer not null default 0,
  longest            integer not null default 0,
  last_extended_date date,
  freezes            smallint not null default 0,
  freezes_used       integer not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.goals_streak enable row level security;

create policy "users can read own goals streak"
  on public.goals_streak for select using (auth.uid() = user_id);
create policy "users can insert own goals streak"
  on public.goals_streak for insert with check (auth.uid() = user_id);
create policy "users can update own goals streak"
  on public.goals_streak for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own goals streak"
  on public.goals_streak for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.goals_streak to anon, authenticated, service_role;

-- ===========================================================================
-- TABLE 4 — public.goal_nudges  (drift-watch cooldown; shared by cron + on-open)
-- ===========================================================================
create table if not exists public.goal_nudges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- references either a big goal or a habit goal; loosely typed so one table covers both
  goal_id        uuid,
  kind           text not null,
  last_nudged_at timestamptz not null default now(),
  -- how the user resolved it: grace / shrunk(ease) / talk. backs the engine off.
  resolution     text check (resolution in ('graced', 'shrunk', 'talk')),
  resolved_at    timestamptz
);

create index if not exists goal_nudges_user_idx
  on public.goal_nudges (user_id, goal_id, last_nudged_at desc);

alter table public.goal_nudges enable row level security;

create policy "users can read own goal nudges"
  on public.goal_nudges for select using (auth.uid() = user_id);
create policy "users can insert own goal nudges"
  on public.goal_nudges for insert with check (auth.uid() = user_id);
create policy "users can update own goal nudges"
  on public.goal_nudges for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own goal nudges"
  on public.goal_nudges for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.goal_nudges to anon, authenticated, service_role;

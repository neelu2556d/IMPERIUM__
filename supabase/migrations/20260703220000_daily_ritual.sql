-- ============================================================================
-- daily_ritual - "Vitality, I'm home" gate + preferences
-- (docs/ideas/VITALITY-IM-HOME-PLAN.md, Phase 5 state)
--
-- One row per user: when the ritual last ran (the once-a-day gate), which acts
-- completed, and the two end-question answers (null = not asked yet), plus the
-- voice toggle for the ElevenLabs layer (Phase 7). The ritual currently keeps
-- this in localStorage (key vitality:<userId>:imhome); this table is its
-- durable cross-device home - the app wires to it in a later pass.
--
-- Additive + idempotent: safe to run anytime, before or after the app deploy.
-- ============================================================================

create table if not exists public.daily_ritual (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  last_homecoming_date date,
  acts_done            jsonb not null default '{}',
  track_water_macros   boolean,
  auto_plan_gym        boolean,
  voice_on             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.daily_ritual enable row level security;

drop policy if exists "users can read own daily ritual" on public.daily_ritual;
create policy "users can read own daily ritual"
  on public.daily_ritual for select using (auth.uid() = user_id);

drop policy if exists "users can insert own daily ritual" on public.daily_ritual;
create policy "users can insert own daily ritual"
  on public.daily_ritual for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own daily ritual" on public.daily_ritual;
create policy "users can update own daily ritual"
  on public.daily_ritual for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own daily ritual" on public.daily_ritual;
create policy "users can delete own daily ritual"
  on public.daily_ritual for delete using (auth.uid() = user_id);

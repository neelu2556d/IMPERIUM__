-- vitals_goals: one ACTIVE wearable goal per user at a time, history kept.
-- Sized by the private health-context engine (see lib/vitals). RLS owner-scoped,
-- mirroring wearable_data. context_snapshot is internal (never shown as a number).
create table if not exists public.vitals_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  metric           text not null check (metric in ('recovery', 'sleep', 'hrv', 'strain')),
  direction        text not null check (direction in ('up', 'hold')),
  baseline_value   numeric(6, 2),
  target_value     numeric(6, 2) not null,
  window_days      integer not null default 28,
  confidence       text not null default 'low' check (confidence in ('low', 'building', 'trusted')),
  is_provisional   boolean not null default true,
  context_snapshot jsonb,
  status           text not null default 'active' check (status in ('active', 'achieved', 'abandoned')),
  source_limiter   text,
  created_at       timestamptz not null default now(),
  baseline_set_at  timestamptz,
  recalibrated_at  timestamptz,
  achieved_at      timestamptz
);

-- one active goal per user (history rows have status achieved/abandoned)
create unique index if not exists vitals_goals_one_active
  on public.vitals_goals (user_id)
  where status = 'active';

create index if not exists vitals_goals_user_idx on public.vitals_goals (user_id, created_at desc);

alter table public.vitals_goals enable row level security;

create policy "users can read own vitals goals"
  on public.vitals_goals for select
  using (auth.uid() = user_id);

create policy "users can insert own vitals goals"
  on public.vitals_goals for insert
  with check (auth.uid() = user_id);

create policy "users can update own vitals goals"
  on public.vitals_goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own vitals goals"
  on public.vitals_goals for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.vitals_goals to anon, authenticated, service_role;

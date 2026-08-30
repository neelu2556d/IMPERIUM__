-- Shared memory layer + vitals insight cache (AI Vitals Mentor).
--
-- user_facts: the APP's durable memory about a user (distinct from `notes`,
-- which is the user's own inbox). Any module's mentor writes facts in and any
-- mentor reads them out, so everything connects. Owner-scoped RLS (hard rule #3),
-- mirroring vitals_goals / coach_memory.
--
-- vitals_insights: per-user-per-day cache of the LLM-generated metric lines so a
-- page refresh is free; regenerated only when the input hash changes.

create table if not exists public.user_facts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  source             text not null,                         -- 'vitals' | 'mental_health' | 'mentor_chat' | ...
  kind               text not null,                         -- 'hobby' | 'stressor' | 'preference' | 'context'
  body               text not null,
  salience           numeric(3, 2) not null default 0.50 check (salience >= 0 and salience <= 1),
  created_at         timestamptz not null default now(),
  last_referenced_at timestamptz,
  expires_at         timestamptz                            -- null = durable; set for transient facts
);

create index if not exists user_facts_user_idx on public.user_facts (user_id, created_at desc);

alter table public.user_facts enable row level security;

create policy "users can read own facts"   on public.user_facts for select using (auth.uid() = user_id);
create policy "users can insert own facts" on public.user_facts for insert with check (auth.uid() = user_id);
create policy "users can update own facts" on public.user_facts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own facts" on public.user_facts for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_facts to anon, authenticated, service_role;

create table if not exists public.vitals_insights (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day_key     text not null,                                -- local YYYY-MM-DD
  input_hash  text not null,                                -- hash of reading+goal+facts; cache key
  lines       jsonb not null,                               -- { recovery: {line,opener}, hrv: {...}, ... }
  created_at  timestamptz not null default now(),
  primary key (user_id, day_key)
);

alter table public.vitals_insights enable row level security;

create policy "users can read own vitals insights"   on public.vitals_insights for select using (auth.uid() = user_id);
create policy "users can insert own vitals insights" on public.vitals_insights for insert with check (auth.uid() = user_id);
create policy "users can update own vitals insights" on public.vitals_insights for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own vitals insights" on public.vitals_insights for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.vitals_insights to anon, authenticated, service_role;

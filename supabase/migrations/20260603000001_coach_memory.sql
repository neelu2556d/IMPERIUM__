-- Coach memory.
--
-- The Food Coach on /app/fuel was ephemeral: chat lived only in React state, so
-- a reload wiped it and the coach had no memory across sessions. These two
-- tables fix that:
--   coach_messages — every turn, both sides, so history can be restored and the
--                    coach keeps seeing recent context.
--   coach_memory   — one distilled "what I know about you" summary per user,
--                    refreshed as the conversation grows, always read into the
--                    coach's context so it gets more personal over time.
--
-- Both are per-user with RLS (hard rule #3): a user only ever touches their own
-- rows. Matches the policy style of the BUILD25 nutrition tables.

create table public.coach_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  day_key    text,
  created_at timestamptz not null default now()
);

create index coach_messages_user_time on public.coach_messages (user_id, created_at);

alter table public.coach_messages enable row level security;

create policy "users can read own coach messages"
  on public.coach_messages for select
  using (auth.uid() = user_id);

create policy "users can insert own coach messages"
  on public.coach_messages for insert
  with check (auth.uid() = user_id);

create policy "users can delete own coach messages"
  on public.coach_messages for delete
  using (auth.uid() = user_id);

create table public.coach_memory (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  summary        text not null default '',
  message_count  int  not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.coach_memory enable row level security;

create policy "users can read own coach memory"
  on public.coach_memory for select
  using (auth.uid() = user_id);

create policy "users can insert own coach memory"
  on public.coach_memory for insert
  with check (auth.uid() = user_id);

create policy "users can update own coach memory"
  on public.coach_memory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

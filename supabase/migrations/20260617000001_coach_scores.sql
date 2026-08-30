-- Coach daily scores.
--
-- The Food Coach on /app/fuel scored a day's eating out of 10, but the score
-- lived ONLY in localStorage (per device, today only). So the History view had
-- no score for past days, and a fresh device lost every score. This table
-- persists one score per user per day, written server-side when the coach
-- scores a day, so History can show the coach's read for any day going forward.
--
-- `sig` is the cheap meal signature (count + kcal) the score was computed for —
-- lets a reader tell whether the saved score still matches the day's food, and
-- skip a recompute when it does.
--
-- Per-user with RLS (hard rule #3). Matches the policy style of coach_messages.

create table public.coach_scores (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day_key    text not null,
  score      int,
  reason     text not null default '',
  sig        text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, day_key)
);

create index coach_scores_user_day on public.coach_scores (user_id, day_key);

alter table public.coach_scores enable row level security;

create policy "users can read own coach scores"
  on public.coach_scores for select
  using (auth.uid() = user_id);

create policy "users can insert own coach scores"
  on public.coach_scores for insert
  with check (auth.uid() = user_id);

create policy "users can update own coach scores"
  on public.coach_scores for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

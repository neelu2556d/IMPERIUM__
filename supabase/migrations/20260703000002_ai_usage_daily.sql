-- ===========================================================================
-- ai_usage_daily, per-user daily counter for AI-endpoint rate limiting
-- ===========================================================================
-- One row per user per LOCAL day (day = the app's getLocalDateKey YYYY-MM-DD,
-- never a UTC-derived key). `count` is the number of AI calls that day. The
-- unique(user_id, day) lets ON CONFLICT DO UPDATE atomically claim-or-increment
-- in a single statement (no read-modify-write race). RLS-scoped so a user can
-- only ever touch their own counter.

create table if not exists public.ai_usage_daily (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- LOCAL date key (YYYY-MM-DD) from @/lib/dates getLocalDateKey. Stored as
  -- `date`; we only ever write the pre-computed local key, never now()/CURRENT_DATE
  -- (server runs UTC -> would mis-bucket non-UTC users near midnight).
  day        date not null,
  count      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists ai_usage_daily_user_day_idx
  on public.ai_usage_daily (user_id, day);

alter table public.ai_usage_daily enable row level security;

create policy "users can read own ai usage"
  on public.ai_usage_daily for select using (auth.uid() = user_id);
create policy "users can insert own ai usage"
  on public.ai_usage_daily for insert with check (auth.uid() = user_id);
create policy "users can update own ai usage"
  on public.ai_usage_daily for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own ai usage"
  on public.ai_usage_daily for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.ai_usage_daily to anon, authenticated, service_role;

-- Atomic claim-or-increment. security definer is safe because the row owner is
-- hard-coded to auth.uid(), so a caller can only ever bump their OWN counter
-- and RLS intent is preserved. Returns the new count so the route enforces on it.
create or replace function public.bump_ai_usage(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.ai_usage_daily (user_id, day, count)
    values (auth.uid(), p_day, 1)
  on conflict (user_id, day)
    do update set count = ai_usage_daily.count + 1, updated_at = now()
  returning count into new_count;
  return new_count;
end $$;

grant execute on function public.bump_ai_usage(date) to authenticated, service_role;

-- ============================================================================
-- Peak module localStorage → Supabase write-mirror (peak_state)
--
-- Follows the BUILD36 pattern (goals_state / supplements_state / brand_state in
-- 20260615000002): the live Peak module (/app/peak) keeps its substance logs,
-- subjective energy taps, stimulant profile, and day tasks in a single
-- localStorage blob (`vitality_peak_v1`) that nothing on the server could read.
-- The Peak *schedule* is already relational (peak_tracker_* tables); this fills
-- the remaining blind spot so the MCP can answer "what have I taken today / how
-- am I feeling" and fold stimulants into the briefing.
--
-- One jsonb blob per user. localStorage stays the PRIMARY client store; this is
-- a best-effort mirror. Additive + idempotent.
-- ============================================================================

create table if not exists public.peak_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS + policies (own-row only) — same shape as the other *_state blobs --------
alter table public.peak_state enable row level security;

drop policy if exists "read own peak_state" on public.peak_state;
create policy "read own peak_state" on public.peak_state for select using (auth.uid() = user_id);

drop policy if exists "insert own peak_state" on public.peak_state;
create policy "insert own peak_state" on public.peak_state for insert with check (auth.uid() = user_id);

drop policy if exists "update own peak_state" on public.peak_state;
create policy "update own peak_state" on public.peak_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own peak_state" on public.peak_state;
create policy "delete own peak_state" on public.peak_state for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.peak_state to anon, authenticated, service_role;

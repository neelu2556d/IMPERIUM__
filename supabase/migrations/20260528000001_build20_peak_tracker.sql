-- BUILD20 — Peak Tracker module
--
-- A daily "today" planner: a mountain-curve timeline showing energy across the
-- day, with tasks pinned to specific hours and a composite peak score. This is
-- separate from /app/peak (periodization + Whoop) — different mental model,
-- different data shape. /app/peak is "where am I in my training cycle"; this
-- is "what am I doing today and when do I peak."

-- ─── peak_tracker_tasks ────────────────────────────────────────────────
-- One row per task scheduled on a given day. `hour` is decimal (16.5 = 4:30
-- PM) to match the rest of the codebase (peak/types.ts ScheduledEvent uses
-- the same convention). `position` only matters when multiple tasks share
-- the same hour and the user has drag-reordered them.

create table public.peak_tracker_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  hour       numeric(4,2) not null check (hour >= 0 and hour < 24),
  title      text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index peak_tracker_tasks_user_date_idx
  on public.peak_tracker_tasks (user_id, date, hour, position);

alter table public.peak_tracker_tasks enable row level security;

create policy "users can read own peak tracker tasks"
  on public.peak_tracker_tasks for select
  using (auth.uid() = user_id);

create policy "users can insert own peak tracker tasks"
  on public.peak_tracker_tasks for insert
  with check (auth.uid() = user_id);

create policy "users can update own peak tracker tasks"
  on public.peak_tracker_tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own peak tracker tasks"
  on public.peak_tracker_tasks for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.peak_tracker_tasks
  to anon, authenticated, service_role;

-- ─── peak_tracker_prefs ────────────────────────────────────────────────
-- Per-user preferences. peak_hour is the user's estimated daily peak (0–23
-- decimal), used to place the NOW dot relative to a personal mountain. We
-- could derive this from completion patterns later, but a user-set anchor
-- is fine for V1 and matches the "PEAKING · 4 PM" copy in the design board.

create table public.peak_tracker_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  peak_hour  numeric(4,2) not null default 16.00
              check (peak_hour >= 0 and peak_hour < 24),
  updated_at timestamptz not null default now()
);

alter table public.peak_tracker_prefs enable row level security;

create policy "users can read own peak tracker prefs"
  on public.peak_tracker_prefs for select
  using (auth.uid() = user_id);

create policy "users can insert own peak tracker prefs"
  on public.peak_tracker_prefs for insert
  with check (auth.uid() = user_id);

create policy "users can update own peak tracker prefs"
  on public.peak_tracker_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.peak_tracker_prefs
  to anon, authenticated, service_role;

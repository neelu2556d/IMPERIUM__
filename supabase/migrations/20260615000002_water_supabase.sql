-- ============================================================================
-- Water → Supabase (the localStorage→Supabase migration, water module)
--
-- The live water tracker stored everything in localStorage (`vitality_water_v1`):
-- per-day serving COUNT + per-user settings. This makes it durable, cross-device,
-- and readable by the Vitality MCP. Modelled on the BUILD13 finance migration.
--
-- Two tables (the existing `water_log` table stores ml-per-drink, which does NOT
-- match the live module's serving-count model, so it stays dormant — repurpose
-- later if we want per-drink granularity):
--   water_prefs  — one row per user: display unit, sizes, activity, caffeine,
--                  substances, setup flag
--   water_days   — one row per (user, day): servings consumed that day
--
-- Additive + idempotent: safe to run anytime, before or after the app deploy.
-- ============================================================================

-- ── water_prefs ────────────────────────────────────────────────────────────
create table if not exists public.water_prefs (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  unit                  text not null default 'bottle',
  bottle_ml             int not null default 500,
  glass_ml              int not null default 250,
  activity_hrs_per_week numeric not null default 5,
  caffeine_mg_per_day   int not null default 200,
  substances            jsonb not null default '[]',
  setup_complete        boolean not null default false,
  imported_local_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.water_prefs enable row level security;

drop policy if exists "users can read own water prefs" on public.water_prefs;
create policy "users can read own water prefs"
  on public.water_prefs for select using (auth.uid() = user_id);

drop policy if exists "users can insert own water prefs" on public.water_prefs;
create policy "users can insert own water prefs"
  on public.water_prefs for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own water prefs" on public.water_prefs;
create policy "users can update own water prefs"
  on public.water_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own water prefs" on public.water_prefs;
create policy "users can delete own water prefs"
  on public.water_prefs for delete using (auth.uid() = user_id);

-- ── water_days ─────────────────────────────────────────────────────────────
create table if not exists public.water_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  count      int not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists water_days_user_date_idx on public.water_days (user_id, date);

alter table public.water_days enable row level security;

drop policy if exists "users can read own water days" on public.water_days;
create policy "users can read own water days"
  on public.water_days for select using (auth.uid() = user_id);

drop policy if exists "users can insert own water days" on public.water_days;
create policy "users can insert own water days"
  on public.water_days for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own water days" on public.water_days;
create policy "users can update own water days"
  on public.water_days for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own water days" on public.water_days;
create policy "users can delete own water days"
  on public.water_days for delete using (auth.uid() = user_id);

-- ── grants (raw-SQL migrations don't auto-grant — see SKILL.md PATCH04) ──────
grant select, insert, update, delete on table public.water_prefs to anon, authenticated, service_role;
grant select, insert, update, delete on table public.water_days  to anon, authenticated, service_role;

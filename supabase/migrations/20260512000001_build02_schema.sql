-- BUILD02: v1 data model
-- Run this in the Supabase SQL editor for project <your-project-ref>.
-- DO NOT run via CLI without reviewing first.

-- ============================================================
-- user_profile
-- ============================================================
create table public.user_profile (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  first_name         text not null,
  birthday           date not null,
  sex                text not null check (sex in ('M', 'F')),
  height_cm          numeric(5, 2) not null,
  starting_weight_kg numeric(5, 2) not null,
  units              text not null default 'metric' check (units in ('metric', 'imperial')),
  goal               text not null check (goal in ('recomp', 'cut', 'bulk', 'maintain', 'general_health')),
  onboarding_step    int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.user_profile enable row level security;

create policy "users can read own profile"
  on public.user_profile for select
  using (auth.uid() = user_id);

create policy "users can insert own profile"
  on public.user_profile for insert
  with check (auth.uid() = user_id);

create policy "users can update own profile"
  on public.user_profile for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own profile"
  on public.user_profile for delete
  using (auth.uid() = user_id);

-- ============================================================
-- weights
-- ============================================================
create table public.weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  weight_kg  numeric(5, 2) not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.weights enable row level security;

create policy "users can read own weights"
  on public.weights for select
  using (auth.uid() = user_id);

create policy "users can insert own weights"
  on public.weights for insert
  with check (auth.uid() = user_id);

create policy "users can update own weights"
  on public.weights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own weights"
  on public.weights for delete
  using (auth.uid() = user_id);

-- ============================================================
-- water_log
-- (multiple entries per day allowed — no unique constraint)
-- ============================================================
create table public.water_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  amount_ml  int not null check (amount_ml > 0),
  logged_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index water_log_user_date_idx on public.water_log (user_id, date);

alter table public.water_log enable row level security;

create policy "users can read own water log"
  on public.water_log for select
  using (auth.uid() = user_id);

create policy "users can insert own water log"
  on public.water_log for insert
  with check (auth.uid() = user_id);

create policy "users can update own water log"
  on public.water_log for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own water log"
  on public.water_log for delete
  using (auth.uid() = user_id);

-- ============================================================
-- supplements_stack
-- ============================================================
create table public.supplements_stack (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  supplement_name  text not null,
  dose             text,
  timing           text,
  with_food        boolean,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.supplements_stack enable row level security;

create policy "users can read own supplements stack"
  on public.supplements_stack for select
  using (auth.uid() = user_id);

create policy "users can insert own supplements stack"
  on public.supplements_stack for insert
  with check (auth.uid() = user_id);

create policy "users can update own supplements stack"
  on public.supplements_stack for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own supplements stack"
  on public.supplements_stack for delete
  using (auth.uid() = user_id);

-- ============================================================
-- wearable_connections
-- ============================================================
create table public.wearable_connections (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  provider                 text not null check (provider in ('whoop')),
  provider_user_id         text not null,
  encrypted_refresh_token  text not null,
  encrypted_access_token   text not null,
  access_token_expires_at  timestamptz not null,
  connected_at             timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.wearable_connections enable row level security;

create policy "users can read own wearable connections"
  on public.wearable_connections for select
  using (auth.uid() = user_id);

create policy "users can insert own wearable connections"
  on public.wearable_connections for insert
  with check (auth.uid() = user_id);

create policy "users can update own wearable connections"
  on public.wearable_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own wearable connections"
  on public.wearable_connections for delete
  using (auth.uid() = user_id);

-- ============================================================
-- wearable_data
-- ============================================================
create table public.wearable_data (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  provider    text not null,
  hrv         numeric(5, 2),
  rhr         int,
  sleep_perf  numeric(5, 2),
  sleep_hours numeric(4, 2),
  recovery    int,
  strain      numeric(4, 2),
  raw         jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, date, provider)
);

create index wearable_data_user_date_idx on public.wearable_data (user_id, date);

alter table public.wearable_data enable row level security;

create policy "users can read own wearable data"
  on public.wearable_data for select
  using (auth.uid() = user_id);

create policy "users can insert own wearable data"
  on public.wearable_data for insert
  with check (auth.uid() = user_id);

create policy "users can update own wearable data"
  on public.wearable_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own wearable data"
  on public.wearable_data for delete
  using (auth.uid() = user_id);

-- ============================================================
-- training_settings
-- ============================================================
create table public.training_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  split_type    text not null check (split_type in ('3_day', '4_day', '5_day', '6_day', 'custom')),
  rotation_days jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.training_settings enable row level security;

create policy "users can read own training settings"
  on public.training_settings for select
  using (auth.uid() = user_id);

create policy "users can insert own training settings"
  on public.training_settings for insert
  with check (auth.uid() = user_id);

create policy "users can update own training settings"
  on public.training_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own training settings"
  on public.training_settings for delete
  using (auth.uid() = user_id);

-- ============================================================
-- workouts
-- ============================================================
create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null,
  day_name     text not null,
  exercises    jsonb not null,
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);

create index workouts_user_date_idx on public.workouts (user_id, date);

alter table public.workouts enable row level security;

create policy "users can read own workouts"
  on public.workouts for select
  using (auth.uid() = user_id);

create policy "users can insert own workouts"
  on public.workouts for insert
  with check (auth.uid() = user_id);

create policy "users can update own workouts"
  on public.workouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own workouts"
  on public.workouts for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Grants
-- Raw SQL CREATE TABLE does not auto-grant the way Supabase
-- dashboard does. Must be explicit for RLS to function.
-- ============================================================
grant select, insert, update, delete on table public.user_profile        to anon, authenticated, service_role;
grant select, insert, update, delete on table public.weights              to anon, authenticated, service_role;
grant select, insert, update, delete on table public.water_log            to anon, authenticated, service_role;
grant select, insert, update, delete on table public.supplements_stack    to anon, authenticated, service_role;
grant select, insert, update, delete on table public.wearable_connections to anon, authenticated, service_role;
grant select, insert, update, delete on table public.wearable_data        to anon, authenticated, service_role;
grant select, insert, update, delete on table public.training_settings    to anon, authenticated, service_role;
grant select, insert, update, delete on table public.workouts             to anon, authenticated, service_role;

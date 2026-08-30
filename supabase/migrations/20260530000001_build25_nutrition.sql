-- BUILD25 — Nutrition (Fuel · Macros module)
--
-- Port of the calories-standalone macro tracker into Vitality as the Macros
-- module under /app/fuel/macros. The standalone stored everything in
-- localStorage; here every record is multi-user and RLS-scoped.
--
-- Design notes:
--  * day_key is a local YYYY-MM-DD string with a 4am rollover (a 2am snack
--    counts toward the previous day). Computed client-side in
--    lib/nutrition/dayKey.ts — NOT the standard lib/dates.ts midnight key.
--    Stored as text (not date) because the rollover offset already baked the
--    local-day decision in; we never want Postgres to re-interpret it as UTC.
--  * foods / totals / unmatched / questions are JSONB, mirroring the
--    workouts.exercises precedent (BUILD10). The macro tracker's nested
--    food+component shape doesn't benefit from a relational split — it's
--    always read and written as a whole meal.
--  * Body weight is NOT stored here. It reuses the existing public.weights
--    table (BUILD02), so the scale graph stays a single source of truth
--    across Fuel and the rest of the app.
--  * Thumbnails are small downscaled base64 data URLs kept inline (the
--    standalone already resizes to a ~thumbnail before storing). Full-res
--    photo upload to Supabase Storage is deferred to a later build.

-- ─── nutrition_meals ───────────────────────────────────────────────────
-- One row per logged meal. A "meal" can be a photo-analyzed plate, a manual
-- food entry, a quick drink, a re-logged favorite, or a barcode scan.

create table public.nutrition_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  day_key     text not null,                         -- YYYY-MM-DD, 4am-rollover local key
  logged_at   timestamptz not null default now(),
  state       text not null default 'confident',     -- confident | uncertain | can_tell | bad_photo
  what_i_see  text,
  meal_type   text not null default 'auto',          -- auto|breakfast|lunch|dinner|snack|restaurant|other
  notes       text,
  totals      jsonb not null default '{"kcal":0,"protein":0,"carbs":0,"fat":0}'::jsonb,
  foods       jsonb not null default '[]'::jsonb,     -- [{ id, name, grams, macros{kcal,protein,carbs,fat}, hintUsed, usdaDescription }]
  unmatched   jsonb not null default '[]'::jsonb,     -- foods USDA/OFF could not resolve (need manual macros)
  questions   jsonb not null default '[]'::jsonb,     -- clarifying questions from the vision parse, with answers
  thumbnail   text,                                   -- small base64 data URL, nullable
  source      text,                                   -- photo|manual|drink|recent|template|barcode (null = legacy)
  source_ref  text,                                   -- quick-drink id / template id when applicable
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index nutrition_meals_user_day_idx
  on public.nutrition_meals (user_id, day_key);

alter table public.nutrition_meals enable row level security;

create policy "users can read own nutrition meals"
  on public.nutrition_meals for select
  using (auth.uid() = user_id);

create policy "users can insert own nutrition meals"
  on public.nutrition_meals for insert
  with check (auth.uid() = user_id);

create policy "users can update own nutrition meals"
  on public.nutrition_meals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own nutrition meals"
  on public.nutrition_meals for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_meals
  to anon, authenticated, service_role;

-- ─── nutrition_goals ───────────────────────────────────────────────────
-- One row per user. Daily targets + the search-mode preference + the
-- first-run onboarding flag. carbs/fat targets are nullable: the standalone
-- only tracks kcal + protein targets, but the columns exist so a future
-- "full macro split" goal needs no migration.

create table public.nutrition_goals (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  kcal_target    numeric not null default 2400,
  protein_target numeric not null default 180,
  carbs_target   numeric,
  fat_target     numeric,
  search_mode    text not null default 'basic',       -- basic | deep
  onboarded      boolean not null default false,
  updated_at     timestamptz not null default now()
);

alter table public.nutrition_goals enable row level security;

create policy "users can read own nutrition goals"
  on public.nutrition_goals for select
  using (auth.uid() = user_id);

create policy "users can insert own nutrition goals"
  on public.nutrition_goals for insert
  with check (auth.uid() = user_id);

create policy "users can update own nutrition goals"
  on public.nutrition_goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_goals
  to anon, authenticated, service_role;

-- ─── nutrition_templates ───────────────────────────────────────────────
-- Saved favorites: a frozen snapshot of a logged meal the user can re-log
-- with one tap. The repeat-meal shortcut is the #1 daily-use lever.

create table public.nutrition_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  foods      jsonb not null default '[]'::jsonb,
  totals     jsonb not null default '{"kcal":0,"protein":0,"carbs":0,"fat":0}'::jsonb,
  thumbnail  text,
  meal_type  text not null default 'auto',
  created_at timestamptz not null default now()
);

create index nutrition_templates_user_idx
  on public.nutrition_templates (user_id, created_at desc);

alter table public.nutrition_templates enable row level security;

create policy "users can read own nutrition templates"
  on public.nutrition_templates for select
  using (auth.uid() = user_id);

create policy "users can insert own nutrition templates"
  on public.nutrition_templates for insert
  with check (auth.uid() = user_id);

create policy "users can update own nutrition templates"
  on public.nutrition_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own nutrition templates"
  on public.nutrition_templates for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_templates
  to anon, authenticated, service_role;

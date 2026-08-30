-- Arts District v2 — IDENTITY (the keystone of the creator flywheel).
--
-- A public maker identity: a one-way-door @username + the maker's "one link"
-- + a short bio, rendered at the public /u/<username> page and used as the
-- byline that credits published tiles (v3).
--
-- WHY A SEPARATE TABLE (not new columns on `profiles`):
-- RLS is row-level, not column-level. The design spec said "add username to
-- profiles, public-read by handle" — but `profiles` also holds billing state
-- (tier, stripe_customer_id, subscription_status, current_period_end) and the
-- onboarding flag. A public-read policy on `profiles` would expose ALL of
-- those columns to anonymous visitors of a profile page. That violates the
-- multi-user hard rule. `creator_profiles` holds ONLY public fields, so a
-- blanket public-read policy is safe by construction and can never leak a
-- billing column added later. Same product intent, RLS-safe realization.
--
-- Keyed by user_id = auth.users.id = profiles.id, so v3's
-- published_tiles.creator_id can reference either and the byline joins here.

create extension if not exists citext;

create table public.creator_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  -- citext = case-insensitive; the unique index makes @AlexWise and @alexwise
  -- the same handle. Stored already-normalized (lowercased) by the app.
  username      citext not null unique
                  check (
                    length(username::text) between 3 and 20
                    and username::text ~ '^[a-z0-9_]+$'
                  ),
  display_name  text check (display_name is null or length(display_name) <= 50),
  bio           text check (bio is null or length(bio) <= 240),
  -- the maker's "one link" (their YouTube / site) — the fuel of the flywheel
  link_url      text check (link_url is null or length(link_url) <= 400),
  instagram_url text check (instagram_url is null or length(instagram_url) <= 400),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Case-insensitive lookup index for /u/<username> (citext already folds case,
-- the unique constraint above provides the index; this is just explicit intent
-- documentation — the unique index serves the lookup).

alter table public.creator_profiles enable row level security;

-- PUBLIC read: anyone (signed-in or anon) can read any maker's public profile.
-- Safe because every column here is intentionally public.
create policy "anyone can read creator profiles"
  on public.creator_profiles for select
  using (true);

-- Self-write only: a user can create / edit / delete only their own row.
create policy "users can insert own creator profile"
  on public.creator_profiles for insert
  with check (auth.uid() = user_id);

create policy "users can update own creator profile"
  on public.creator_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own creator profile"
  on public.creator_profiles for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest.
create or replace function public.touch_creator_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creator_profiles_touch_updated_at
  before update on public.creator_profiles
  for each row execute function public.touch_creator_profiles_updated_at();

-- Grants. Raw SQL CREATE TABLE does not auto-grant the way the Supabase
-- dashboard does — must be explicit for RLS to function. anon gets SELECT
-- only (public read); authenticated gets full CRUD (gated to own row by RLS).
grant select on table public.creator_profiles to anon;
grant select, insert, update, delete on table public.creator_profiles to authenticated, service_role;

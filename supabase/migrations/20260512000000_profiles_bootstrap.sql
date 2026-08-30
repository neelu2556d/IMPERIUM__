-- Profiles bootstrap — REQUIRED FIRST MIGRATION for fresh installs.
--
-- On the original instance, public.profiles was created by hand before the
-- migration history began, so later migrations (BUILD22 Stripe billing) alter
-- it without creating it. This migration makes a fresh `supabase db push`
-- self-sufficient:
--
--   1. Creates public.profiles — the row every signed-in user must have.
--      The app reads profiles.onboarded (middleware, /welcome) and
--      profiles.tier (server-side tier gating). BUILD22 later adds the
--      Stripe columns.
--   2. Installs an `after insert on auth.users` trigger so every new signup
--      gets a profiles row automatically (no app code inserts one).
--   3. Backfills a row for any pre-existing auth user.
--
-- Everything is idempotent so instances that already created profiles by
-- hand can apply it safely.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  onboarded boolean not null default false,
  tier text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own on public.profiles
      for select using (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own on public.profiles
      for update using (id = auth.uid()) with check (id = auth.uid());
  end if;
end
$$;

-- Raw-SQL tables get no default grants (see the BUILD02 grants migration).
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- Every new auth user gets a profiles row. Security definer so the trigger
-- can insert regardless of the signing-up role's grants.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users that signed up before this migration ran.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

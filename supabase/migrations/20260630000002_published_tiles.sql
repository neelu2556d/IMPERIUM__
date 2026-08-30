-- Arts District v3 — PUBLISH + credit (the spine).
--
-- A maker publishes a tile: a server-side snapshot of the sealed tile, credited
-- to their handle (creator_profiles), free for anyone to add via the LOCKED
-- importTile socket. Personal tiles stay in localStorage; only a PUBLISHED tile
-- lives here.
--
-- NOT YET APPLIED to prod. Apply (after review) the v2-proven safe way:
--   supabase db query --linked -f supabase/migrations/20260630000002_published_tiles.sql
-- (NOT `db push` — prod has migration-history drift.)
--
-- Moderation is curated-at-launch (locked decision): a new row is 'pending';
-- the public shop shows only 'approved'; the maker always sees their own (any
-- status) on their /u page. Alex/Sam flip status to 'approved'. A creator can
-- never self-approve (enforced by the trigger below).

create table public.published_tiles (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  html          text not null,                 -- the sealed tile snapshot (TileEnvelope.html)
  envelope      jsonb not null,                -- full TileEnvelope for a pure importTile(envelope)
  category      text check (category is null or length(category) <= 40),
  opt_in_reuse  boolean not null default true,
  install_count integer not null default 0,    -- exists now; incremented server-side in v4
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index published_tiles_creator_idx on public.published_tiles (creator_id, created_at desc);
create index published_tiles_approved_idx on public.published_tiles (status, created_at desc)
  where status = 'approved';

alter table public.published_tiles enable row level security;

-- PUBLIC read of APPROVED tiles only (the shop). anon + authenticated.
create policy "anyone can read approved tiles"
  on public.published_tiles for select
  using (status = 'approved');

-- A creator can always read their OWN tiles (any status) — for the /u page + manage.
create policy "creators read own tiles"
  on public.published_tiles for select
  using (auth.uid() = creator_id);

-- Self-write. A creator may only ever INSERT a 'pending' row (no self-publish).
create policy "creators insert own pending tiles"
  on public.published_tiles for insert
  with check (auth.uid() = creator_id and status = 'pending');

create policy "creators update own tiles"
  on public.published_tiles for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "creators delete own tiles"
  on public.published_tiles for delete
  using (auth.uid() = creator_id);

-- Guard the moderation gate: a non-service_role caller can never move `status`
-- to 'approved' (so the UPDATE policy above can't be used to self-approve).
-- service_role (the admin flip) bypasses RLS + this check via the role test.
create or replace function public.guard_published_tiles_status()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status is distinct from old.status
     and new.status = 'approved'
     and current_setting('role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    raise exception 'cannot self-approve a published tile';
  end if;
  return new;
end;
$$;

create trigger published_tiles_guard_status
  before update on public.published_tiles
  for each row execute function public.guard_published_tiles_status();

-- Grants. anon read-only (RLS still restricts to approved); authenticated full
-- CRUD (RLS scopes to own rows); service_role for the admin approval flip.
grant select on table public.published_tiles to anon;
grant select, insert, update, delete on table public.published_tiles to authenticated, service_role;

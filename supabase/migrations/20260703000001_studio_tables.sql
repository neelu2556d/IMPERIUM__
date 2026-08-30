-- ===========================================================================
-- studio_videos + studio_links -- the Studio tile's authoritative per-user store
-- ===========================================================================
-- The Studio tile is a sealed Arts District tile: a per-video "brain" of manual
-- upload-package fields plus a reusable link library. Its working set rides the
-- Vitality.save/load bridge, which the host mirrors into these two RLS-scoped
-- tables so a creator's cards persist and cross devices (localStorage alone caps
-- at 512KB/tile and is single-device; these tables are the real store).
--   studio_videos = one row per video card (manual fields; status lifecycle)
--   studio_links  = one row per saved link, optionally attached to a video
-- Every read/write is scoped to the owner via RLS (auth.uid() = user_id).

create table if not exists public.studio_videos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  url          text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at date,
  notes        text,
  extra        jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists studio_videos_user_idx on public.studio_videos (user_id, created_at desc);

create table if not exists public.studio_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  video_id   uuid references public.studio_videos(id) on delete cascade,
  label      text not null,
  url        text not null,
  kind       text not null default 'other' check (kind in ('social', 'store', 'affiliate', 'other')),
  is_default boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists studio_links_user_idx on public.studio_links (user_id, position);

alter table public.studio_videos enable row level security;
alter table public.studio_links enable row level security;

create policy "users can read own studio videos"   on public.studio_videos for select using (auth.uid() = user_id);
create policy "users can insert own studio videos" on public.studio_videos for insert with check (auth.uid() = user_id);
create policy "users can update own studio videos" on public.studio_videos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own studio videos" on public.studio_videos for delete using (auth.uid() = user_id);

create policy "users can read own studio links"   on public.studio_links for select using (auth.uid() = user_id);
create policy "users can insert own studio links" on public.studio_links for insert with check (auth.uid() = user_id);
create policy "users can update own studio links" on public.studio_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own studio links" on public.studio_links for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.studio_videos to anon, authenticated, service_role;
grant select, insert, update, delete on table public.studio_links  to anon, authenticated, service_role;

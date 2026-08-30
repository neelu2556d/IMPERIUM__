-- ============================================================
-- Social snapshots (BUILD51) — the Social Command Center's store.
--
-- Instagram / TikTok / YouTube analytics can't be pulled by API without
-- Meta/TikTok app review, so the Command Center runs a SEMI-MANUAL loop: we
-- generate a read-only prompt the user runs in their Claude Chrome extension on
-- their own analytics page, they paste the returned stats back, and we parse +
-- store them here with a timestamp. History over time powers the charts + the
-- AI advisor. One row per paste (per user, brand, platform, capture time).
--
-- Wide named columns for the common engagement metrics (so charting one series
-- is trivial) + an `extra` jsonb for anything else the paste contained.
-- RLS-scoped to the owner; brand_ref ties it to a localStorage brand id.
-- ============================================================

create table public.social_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  brand_ref          text not null default '',
  platform           text not null,         -- youtube | instagram | tiktok | other
  captured_at        timestamptz not null default now(),
  period             text not null default '28d',
  followers          numeric,
  views              numeric,
  reach              numeric,
  pct_non_followers  numeric,
  likes              numeric,
  comments           numeric,
  saves              numeric,
  shares             numeric,
  follows            numeric,
  engagement_rate    numeric,
  extra              jsonb,                  -- any other metrics the paste held
  top_comments       jsonb,                  -- array of strings
  raw                text,                   -- the original pasted text
  note               text,
  created_at         timestamptz not null default now()
);

create index social_snapshots_user_brand_idx
  on public.social_snapshots (user_id, brand_ref, platform, captured_at desc);

alter table public.social_snapshots enable row level security;

create policy "users can read own social snapshots"
  on public.social_snapshots for select
  using (auth.uid() = user_id);

create policy "users can insert own social snapshots"
  on public.social_snapshots for insert
  with check (auth.uid() = user_id);

create policy "users can update own social snapshots"
  on public.social_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own social snapshots"
  on public.social_snapshots for delete
  using (auth.uid() = user_id);

-- Raw CREATE TABLE doesn't auto-grant the API roles (see build02_grants.sql).
grant select, insert, update, delete on table public.social_snapshots to anon, authenticated, service_role;

-- ===========================================================================
-- tile_streams + tile_reports — the tile-to-Vee report contract, in the database
-- ===========================================================================
-- A sealed tile feeds Vee one numeric life-stream via Vitality.report({ key,
-- label, value, date, kind, goalDirection }). Two tables hold it, both RLS-scoped
-- so one user's tile can never read or write another's stream:
--   tile_streams  = the IDENTITY of a stream (one row per user+key). canonical_key
--                   normalizes families (beer/brews/pints -> alcohol) so the
--                   noticed engine can carry cross-user priors. kind is the fixed
--                   ~7-member taxonomy that tells the generic engine how to treat
--                   a number it has never seen (see lib/tiles/reportContract.ts).
--   tile_reports  = one logged datapoint (user+stream_key+date is unique, so
--                   re-logging a day upserts instead of duplicating).
-- Written by the reportStream server action (app/app/create/reportActions.ts via
-- lib/tiles/reportWrites.ts). Read by the noticed engine through
-- lib/tiles/tileInsight.ts (reportsToSeries -> alignByBucket -> detectSeam).

create table if not exists public.tile_streams (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- raw key as the tile reported it, e.g. 'beer'. Unique per user.
  key            text not null,
  -- normalized family for cross-user priors, e.g. 'alcohol'. Defaults to key.
  canonical_key  text not null,
  label          text not null,
  -- the fixed taxonomy. Loosely typed via a check so the DB and the TS enum agree.
  kind           text not null check (kind in
                   ('intake', 'count', 'duration', 'rating', 'measure', 'money', 'done')),
  -- what "good" looks like, so downstream copy reads right. null = unspecified.
  goal_direction text check (goal_direction in ('up', 'down', 'neutral')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, key)
);

create table if not exists public.tile_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- links to tile_streams.key for the same user (one value per stream per day).
  stream_key  text not null,
  value       numeric not null,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, stream_key, date)
);

create index if not exists tile_reports_user_stream_idx
  on public.tile_reports (user_id, stream_key, date);

alter table public.tile_streams enable row level security;
alter table public.tile_reports enable row level security;

create policy "users can read own tile streams"
  on public.tile_streams for select using (auth.uid() = user_id);
create policy "users can insert own tile streams"
  on public.tile_streams for insert with check (auth.uid() = user_id);
create policy "users can update own tile streams"
  on public.tile_streams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own tile streams"
  on public.tile_streams for delete using (auth.uid() = user_id);

create policy "users can read own tile reports"
  on public.tile_reports for select using (auth.uid() = user_id);
create policy "users can insert own tile reports"
  on public.tile_reports for insert with check (auth.uid() = user_id);
create policy "users can update own tile reports"
  on public.tile_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own tile reports"
  on public.tile_reports for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.tile_streams to anon, authenticated, service_role;
grant select, insert, update, delete on table public.tile_reports to anon, authenticated, service_role;

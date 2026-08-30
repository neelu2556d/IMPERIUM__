-- Personal tile registry (the build -> dashboard loop keystone).
--
-- Replaces the localStorage v1 in lib/tiles/tileStore.ts with a server-side
-- table so a tile built anywhere (the MCP in Claude Code, the create page, a
-- paste) lands on the user's dashboard on any device. Shape agreed with the
-- MCP window in mcp/docs/tiles-table-contract.md so both sides build to one
-- target and a single prod migration covers it.
--
-- Runtime data a tile persists via Vitality.save() lives in a SEPARATE row
-- (tile_data) so a growing payload never rewrites the html — exactly how
-- tileStore splits index vs data today.
--
-- RLS: a user only ever sees their own tiles. auth.uid() covers the dashboard
-- + the MCP's user-session mode; the MCP's service-role mode stamps user_id by
-- hand (RLS bypassed there), so writes still scope correctly.

create table if not exists public.tiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  html        text not null,                 -- the sealed tile source (iframe srcDoc)
  stream      jsonb,                          -- {key,label,kind,goalDirection} or null
  category    text,                           -- fitness|health|finance|mind|data
  color       text,                           -- hex accent (#RGB or #RRGGBB)
  source      text not null default 'mcp',    -- 'mcp' | 'paste' | 'hub'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tiles enable row level security;

create policy "tiles owner rw" on public.tiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tiles_user_idx on public.tiles(user_id, updated_at desc);

-- Runtime data a tile persists via Vitality.save(), kept separate from the html.
create table if not exists public.tile_data (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tile_id    uuid not null references public.tiles(id) on delete cascade,
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tile_id)
);

alter table public.tile_data enable row level security;

create policy "tile_data owner rw" on public.tile_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grants. Raw SQL CREATE TABLE does not auto-grant; RLS still scopes every row.
grant select, insert, update, delete on table public.tiles      to authenticated, service_role;
grant select, insert, update, delete on table public.tile_data  to authenticated, service_role;

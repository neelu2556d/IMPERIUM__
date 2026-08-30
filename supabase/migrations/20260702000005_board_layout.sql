-- Board-sync cross-device (the arranged-dashboard keystone).
--
-- Mirrors a user's home board arrangement to the server so a dashboard laid out
-- on one device reappears on a second: the ordered list of placed tile ids
-- (homeLayout) plus each tile's look (tileSkin — size, design, color, name,
-- living dots). Both are single per-user localStorage blobs today, so this is
-- ONE row per user (an upsert) carrying both blobs, not one row per placement.
-- A reorder or a resize is a single whole-board write; a pull on another device
-- adopts the whole board last-write-wins. That matches the shape of the state
-- (each store is one blob) and keeps a drag from fanning out into N row writes.
--
-- Additive + best-effort, exactly like the tiles / tile_data mirror: a missing
-- table or offline leaves the local board untouched. The tiles themselves live
-- in `tiles` (their html + registry); this table only records the arrangement.
--
-- RLS: a user only ever sees + writes their own board row. auth.uid() covers the
-- dashboard (the only writer); there is no service-role writer for the board.
--
-- NOT YET APPLIED to prod. Apply (after review) the v2-proven safe way:
--   supabase db query --linked -f supabase/migrations/20260702000004_board_layout.sql
-- (NOT `db push` — prod has migration-history drift.)

create table if not exists public.board_layout (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ordering   jsonb not null default '[]'::jsonb,   -- string[] of placed tile ids, in display order
  skins      jsonb not null default '{}'::jsonb,   -- Record<tileId, {size,design,color,name,livingDots}>
  updated_at timestamptz not null default now()
);

alter table public.board_layout enable row level security;

create policy "board_layout owner rw" on public.board_layout
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grants. Raw SQL CREATE TABLE does not auto-grant; RLS still scopes every row.
grant select, insert, update, delete on table public.board_layout to authenticated, service_role;

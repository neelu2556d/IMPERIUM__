-- Cross-device tile deletion tombstones (merge-gate review finding 5, 2026-07-02).
--
-- Problem: deleting a tile removes its `tiles` row, but pullAndMerge on another
-- device is add-only, so that device keeps its local copy and the deleted tile
-- lives on there. A tombstone records "this tile id was deleted" so every other
-- device prunes its local copy on the next pull.
--
-- RLS-scoped to the owner. `tile_id` is not an FK (the tiles row is already gone
-- when the tombstone is written). A tombstone is harmless to keep; a periodic
-- cleanup can prune rows older than a sync window later.
--
-- NOT YET APPLIED to prod. Apply (after review) the v2-proven safe way:
--   supabase db query --linked -f supabase/migrations/20260702000003_tile_tombstones.sql
-- (NOT `db push` — prod has migration-history drift.)

create table if not exists public.deleted_tiles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tile_id    uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, tile_id)
);

alter table public.deleted_tiles enable row level security;

create policy "deleted_tiles owner rw" on public.deleted_tiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists deleted_tiles_user_idx on public.deleted_tiles(user_id, deleted_at desc);

grant select, insert, update, delete on table public.deleted_tiles to authenticated, service_role;

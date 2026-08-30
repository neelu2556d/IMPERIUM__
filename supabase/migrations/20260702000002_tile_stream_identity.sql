-- ===========================================================================
-- Per-tile stream identity (PATCH21) — two different tiles may honestly report
-- the same key. Before this, tile_streams was unique (user_id, key) and
-- tile_reports keyed datapoints by bare stream_key text, so your beer tile and
-- a friend's shared beer tile CLOBBERED each other's label/kind and merged
-- unrelated datapoints. That poisons the orb score and the connections engine
-- the moment tiles are shared.
--
-- The fix: a stream's row identity becomes (user_id, tile_id, key), and each
-- datapoint references its stream's surrogate id. canonical_key is UNCHANGED —
-- cross-user families (beer -> alcohol) still aggregate by canonical_key; only
-- the per-user ROW identity becomes tile-scoped.
--
-- tile_id is TEXT, not a FK: tiles live in the client registry (and may be a
-- provisional 'draft' id on the Create page before a tile is Kept), so a
-- report must never be dropped for lacking a server tiles row.
-- ===========================================================================

-- 1) tile_streams: tile-scoped identity ------------------------------------
alter table public.tile_streams
  add column if not exists tile_id text not null default '';

alter table public.tile_streams
  drop constraint if exists tile_streams_user_id_key_key;

create unique index if not exists tile_streams_user_tile_key_idx
  on public.tile_streams (user_id, tile_id, key);

-- 2) tile_reports: datapoints reference their stream row --------------------
alter table public.tile_reports
  add column if not exists stream_id uuid references public.tile_streams(id) on delete cascade;

-- Backfill is unambiguous: under the OLD identity a user had at most one
-- stream per key, so (user_id, stream_key) maps to exactly one stream row.
update public.tile_reports r
set stream_id = s.id
from public.tile_streams s
where r.stream_id is null
  and s.user_id = r.user_id
  and s.key = r.stream_key;

-- A datapoint whose stream row no longer exists is unreadable by every
-- consumer (they all join through the stream) — drop rather than strand.
delete from public.tile_reports where stream_id is null;

alter table public.tile_reports
  alter column stream_id set not null;

alter table public.tile_reports
  drop constraint if exists tile_reports_user_id_stream_key_date_key;

-- The unique index doubles as the read path's (user_id, stream_id, date)
-- lookup index, so the old stream_key index is simply replaced.
create unique index if not exists tile_reports_user_stream_id_date_idx
  on public.tile_reports (user_id, stream_id, date);

drop index if exists public.tile_reports_user_stream_idx;

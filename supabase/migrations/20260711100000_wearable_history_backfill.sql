-- ============================================================
-- TRAIN 5: wearable history backfill marker
-- ============================================================
-- On first connect (and one catchup for already-connected users) we pull
-- ~30 days of WHOOP / Oura history into wearable_data so the score history
-- line exists on day one. This column makes the catchup truly ONE-TIME:
-- the sync route only attempts a backfill while it is null, then stamps it.
-- Null on existing rows means "not yet caught up", which is exactly right.
--
-- No new RLS needed: wearable_connections is already scoped to its owner
-- and the update policy covers this column.

alter table public.wearable_connections
  add column if not exists history_backfilled_at timestamptz;

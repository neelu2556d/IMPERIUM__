-- Report-stream write caps at the DB layer (merge-gate review finding 7 backstop, 2026-07-02).
--
-- The app already bounds key (<=64), label (<=120) and value magnitude in
-- lib/tiles/reportContract.validateReport (shipped in 2a967fc). These CHECK
-- constraints enforce the same limits in Postgres so a future write path (or a
-- service-role write) can never store unbounded strings / absurd values a
-- runaway or hostile tile might send. Additive + idempotent (IF NOT EXISTS guards).
--
-- NOT YET APPLIED to prod. Apply (after review) the v2-proven safe way:
--   supabase db query --linked -f supabase/migrations/20260702000002_report_caps.sql
-- (NOT `db push` — prod has migration-history drift.) Safe: tile_streams /
-- tile_reports are effectively empty at launch, so no existing row can violate.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tile_streams_key_len') then
    alter table public.tile_streams add constraint tile_streams_key_len check (char_length(key) <= 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tile_streams_label_len') then
    alter table public.tile_streams add constraint tile_streams_label_len check (char_length(label) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tile_reports_value_range') then
    alter table public.tile_reports add constraint tile_reports_value_range check (abs(value) <= 1e9);
  end if;
end $$;

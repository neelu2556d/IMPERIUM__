-- Link a durable fact back to the row that created it (a goal id, a metric id, …).
--
-- Until now user_facts had no pointer to its origin, so a module could write a
-- fact but never find it again to refresh or remove it. That left Vee's memory
-- drifting out of sync: a deleted goal's fact lingered, a progress change never
-- reached chat, flipping a goal to "silent" did not retract what was already
-- said. ref_id is the generic fix — any source can stamp the id of the row a
-- fact describes, then upsert/delete by (user_id, source, ref_id).
--
-- Nullable + additive: existing facts keep ref_id = null (they simply aren't
-- ref-managed), so no backfill and no behaviour change for other sources.

alter table public.user_facts add column if not exists ref_id text;

-- The lookup goal lifecycle does: "every fact this source wrote for this row".
create index if not exists user_facts_ref_idx
  on public.user_facts (user_id, source, ref_id);

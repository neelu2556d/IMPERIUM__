-- ===========================================================================
-- noticed_ledger — the "Vitality noticed" cooldown ledger
-- ===========================================================================
-- The §01 cross-domain card (caffeine x recovery, sleep x training, ...) should
-- land like a gift, not a feed of repeats. This table rests each cross-domain
-- PATTERN on its own clock after it is shown, mirroring the drift cooldown
-- (goal_nudges) 1:1 — same RLS, same shape — but keyed by pattern_key instead of
-- kind, so a freshly-found seam can still surface while a recently-shown one
-- stays quiet. Read in the gather (app/app/mentor/page.tsx), written by the
-- logNoticedShown server action. Pure cooldown logic lives in
-- lib/insights/noticedLedger.ts.
create table if not exists public.noticed_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- the cross-domain pairing this row rests, e.g. 'caffeine+recovery' (sorted,
  -- lowercased — see patternKeyOf). Loosely typed so any future seam fits.
  pattern_key    text not null,
  last_shown_at  timestamptz not null default now(),
  -- how the user resolved it: dismissed (got it) / talk (took it into Claude).
  -- null = shown but not yet acted on. A resolution rests the pattern longer.
  resolution     text check (resolution in ('dismissed', 'talk')),
  resolved_at    timestamptz
);

create index if not exists noticed_ledger_user_idx
  on public.noticed_ledger (user_id, pattern_key, last_shown_at desc);

alter table public.noticed_ledger enable row level security;

create policy "users can read own noticed ledger"
  on public.noticed_ledger for select using (auth.uid() = user_id);
create policy "users can insert own noticed ledger"
  on public.noticed_ledger for insert with check (auth.uid() = user_id);
create policy "users can update own noticed ledger"
  on public.noticed_ledger for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own noticed ledger"
  on public.noticed_ledger for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.noticed_ledger to anon, authenticated, service_role;

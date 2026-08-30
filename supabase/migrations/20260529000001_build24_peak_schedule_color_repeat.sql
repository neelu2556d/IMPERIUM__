-- BUILD24 — Peak "Your Day" schedule: per-task color + repeat.
--
-- The unified Peak dashboard (/app/peak) brings the schedule front-and-centre
-- with a vertical day calendar. Each scheduled item now carries its own accent
-- colour (a dusk-palette shade so overlapping blocks stay distinguishable) and
-- an optional repeat rule. Both are additive columns on the existing
-- peak_tracker_tasks table; the BUILD20 RLS policies + grants still apply.

alter table public.peak_tracker_tasks
  add column if not exists color text,
  add column if not exists repeat text not null default 'none'
    check (repeat in ('none', 'daily', 'weekdays'));

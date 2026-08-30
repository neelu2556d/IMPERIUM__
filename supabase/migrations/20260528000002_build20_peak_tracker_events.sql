-- BUILD20 (cont.) — Peak Tracker events + richer tasks.
--
-- The canonical design separates **events** (fixed blocks like class/gym/work)
-- from **tasks** (movable items with difficulty + duration auto-placed on the
-- curve). The earlier migration only modelled tasks with a single `hour`
-- column; this adds the richer shape from the design board.

-- Add event/task distinction + planner fields to existing tasks table.
alter table public.peak_tracker_tasks
  add column if not exists kind text not null default 'task'
    check (kind in ('task', 'event')),
  add column if not exists difficulty text
    check (difficulty in ('easy', 'normal', 'hard')),
  add column if not exists duration_hours numeric(4,2)
    check (duration_hours is null or (duration_hours > 0 and duration_hours <= 12)),
  add column if not exists end_hour numeric(4,2)
    check (end_hour is null or (end_hour >= 0 and end_hour < 24)),
  add column if not exists event_type text
    check (event_type in ('school', 'gym', 'work', 'practice', 'default')),
  add column if not exists pinned boolean not null default false;

-- `hour` is now optional (auto-placed tasks may not have a fixed start yet).
alter table public.peak_tracker_tasks alter column hour drop not null;

-- Recovery level + peakedness shape per user (drives curve tone + amplitude).
alter table public.peak_tracker_prefs
  add column if not exists recovery_level text not null default 'high'
    check (recovery_level in ('high', 'mid', 'low')),
  add column if not exists peakedness numeric(3,2) not null default 0.6
    check (peakedness >= 0 and peakedness <= 1);

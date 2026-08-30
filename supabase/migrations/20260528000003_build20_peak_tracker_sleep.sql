-- BUILD20 (cont.) — Peak Tracker sleep prefs.
--
-- The canonical design exposes a Sleep Window card with a target bedtime,
-- last-night ribbon, and a red wind-down zone. The card needs two
-- user-tunable inputs: `wake_time` (target wake hour, decimal 0-23) and
-- `sleep_need_hours` (target hours of sleep). Defaults: 6:30 AM / 8h —
-- matches Today.html's TWEAK_DEFAULTS.

alter table public.peak_tracker_prefs
  add column if not exists wake_time numeric(4,2) not null default 6.50
    check (wake_time >= 0 and wake_time < 24),
  add column if not exists sleep_need_hours numeric(4,2) not null default 8.00
    check (sleep_need_hours >= 4 and sleep_need_hours <= 14);

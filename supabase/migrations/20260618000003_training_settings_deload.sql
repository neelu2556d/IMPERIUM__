-- Deload week marker on the user's training settings.
--
-- A deload is a planned light week applied across ONE pass through the split:
-- each training day gets one eased session (volume cut ~half, ~10% lighter,
-- stop short of failure), then it's "spent" and the next block resumes at the
-- real baseline. We track only the START date here; which days are still owed
-- an easy session is derived from the workouts rows stamped off_day = 'deload'
-- on or after this date (see getDeloadedDayNamesSince). A safety window in the
-- app treats a stale start (more than ~3 weeks old) as finished.
--
-- Nullable, defaults to null = not deloading. RLS on public.training_settings
-- already scopes reads/writes to auth.uid(); a new column needs no new policy.

alter table public.training_settings
  add column if not exists deload_started_on date;

-- "Start a new week" marker on the user's training settings.
--
-- Tapping "Start a new week" wipes the schedule board back to a clean slate
-- WITHOUT touching a single logged workout row. We record only the MOMENT the
-- user reset; the schedule then shows a day as "completed" only if its session
-- was finished AFTER this timestamp (see app/app/fitness/log/page.tsx). So the
-- board clears instantly (even a session finished earlier the same day) and
-- lights back up as the user trains the new week. History, graphs and PRs are
-- never altered — this is a read-time filter, not a data mutation. The action
-- is fully reversible: Undo just restores the previous value of this column.
--
-- Nullable, default null = never reset. RLS on public.training_settings already
-- scopes reads/writes to auth.uid(); a new column needs no new policy.

alter table public.training_settings
  add column if not exists cycle_started_at timestamptz;

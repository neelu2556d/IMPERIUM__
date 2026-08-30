-- ============================================================================
-- Bug reports — the in-app "Report a problem" button's store.
--
-- One row per report. RLS-scoped: a user can only insert + read their OWN
-- reports (they can't see anyone else's). You (the maintainers) read every
-- report via the Supabase dashboard / SQL editor (service role bypasses RLS):
--   select created_at, page, message from bug_reports order by created_at desc;
-- Additive + idempotent.
-- ============================================================================

create table if not exists public.bug_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,
  page       text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;

drop policy if exists "br_ins" on public.bug_reports;
create policy "br_ins" on public.bug_reports for insert with check (auth.uid() = user_id);

drop policy if exists "br_sel" on public.bug_reports;
create policy "br_sel" on public.bug_reports for select using (auth.uid() = user_id);

grant select, insert on table public.bug_reports to anon, authenticated, service_role;

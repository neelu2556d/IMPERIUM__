-- BUILD16 — notes table for the Mentor module
--
-- One row per saved note. Used by the AI mentor as a long-running "inbox" the
-- user can dump thoughts into ("event 7pm tomorrow", "drink less", "remind me
-- to call dad") and the chat route reads as context when answering.

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_created_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

create policy "users can read own notes"
  on public.notes for select
  using (auth.uid() = user_id);

create policy "users can insert own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

create policy "users can update own notes"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own notes"
  on public.notes for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.notes
  to anon, authenticated, service_role;

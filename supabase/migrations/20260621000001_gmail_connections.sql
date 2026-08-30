-- Gmail OAuth connections — per-user, read-only inbox pull.
-- Stores the user's Google refresh token (sealed via CONNECTOR_ENCRYPTION_KEY,
-- same envelope as the business connectors) so we can mint short-lived access
-- tokens server-side and read their recent inbox. One row per user.

create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  credentials jsonb not null,
  connected_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;

create policy "users read own gmail connection"
  on public.gmail_connections for select using (auth.uid() = user_id);
create policy "users insert own gmail connection"
  on public.gmail_connections for insert with check (auth.uid() = user_id);
create policy "users update own gmail connection"
  on public.gmail_connections for update using (auth.uid() = user_id);
create policy "users delete own gmail connection"
  on public.gmail_connections for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.gmail_connections
  to anon, authenticated, service_role;

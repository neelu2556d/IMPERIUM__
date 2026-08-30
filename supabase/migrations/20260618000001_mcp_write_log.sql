-- Hosted MCP — write audit log (BUILD45).
--
-- Every mutation the MCP makes on a user's behalf records a row here: which tool
-- ran and a one-line human summary of what changed. This is the paper trail for
-- the (new in BUILD42) write surface — "what did Claude actually do to my data?"
--
-- Scoped like the rest of the user's data: RLS, owner-only. The MCP writes these
-- under the caller's OWN RLS client (auth.uid() = user_id), so the audit row can
-- only ever be attributed to the acting user — never forged for someone else.
-- Insert is best-effort in the app: a failed audit never fails the actual write.
--
-- Idempotent and additive.

create table if not exists public.mcp_write_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool       text not null,                 -- e.g. 'vitality_log_weight'
  summary    text,                          -- one-line, human-readable
  created_at timestamptz not null default now()
);
create index if not exists mcp_write_log_user_idx on public.mcp_write_log (user_id, created_at desc);

alter table public.mcp_write_log enable row level security;

drop policy if exists "users read own mcp write log" on public.mcp_write_log;
create policy "users read own mcp write log" on public.mcp_write_log
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own mcp write log" on public.mcp_write_log;
create policy "users insert own mcp write log" on public.mcp_write_log
  for insert with check (auth.uid() = user_id);

grant select, insert on public.mcp_write_log to authenticated;

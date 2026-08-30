-- Hosted MCP — per-user connect credentials (Phase 1).
--
-- Backs the "Connect to Claude" feature: a user mints an opaque, revocable,
-- short-TTL token in /account and pastes it into their Claude client. The
-- hosted MCP route (app/api/mcp) validates it at request time and runs every
-- tool under THAT user's row-level security — never another user's data.
--
-- Security shape (from docs/ideas/hosted-mcp-build-plan.md §5, post-review):
--   • The raw token (`vitm_<base64url>`) is shown ONCE at creation and never
--     stored — only its sha256 hash, a non-secret prefix, and last-4 are kept.
--   • The table is owner-scoped by RLS for the BROWSER management surface only
--     (the /account list + revoke). It is NOT readable by `anon`.
--   • Request-time validation goes exclusively through the SECURITY DEFINER
--     resolver below (never a raw table read), so there is no cross-tenant
--     token-hash oracle and no service-role on the hot path.
--   • short `expires_at` is a security control, not just UX. Soft-revoke via
--     `revoked_at`.
--
-- Idempotent and additive. Safe to run independently of other pending work.

create table if not exists public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Claude',            -- device/label, user-facing
  token_prefix text not null,                              -- e.g. 'vitm_AbC' (non-secret, for display + lookup)
  token_last4  text not null,                              -- non-secret tail, for display
  token_hash   text not null,                              -- sha256(raw); raw is shown once, never persisted
  scopes       text[] not null default array['mcp:read'],
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,                       -- short TTL = security control
  last_used_at timestamptz,
  revoked_at   timestamptz,                                -- soft revoke
  unique (token_hash)
);

create index if not exists mcp_tokens_user_id_idx on public.mcp_tokens (user_id);
create index if not exists mcp_tokens_prefix_idx on public.mcp_tokens (token_prefix);

alter table public.mcp_tokens enable row level security;

-- Owner-scoped policies for the AUTHENTICATED (browser-session) management UI only.
-- Deliberately NO policy/grant lets `anon` SELECT this table: request-time
-- validation runs exclusively through public.mcp_resolve_token (below).
drop policy if exists mcp_tokens_select on public.mcp_tokens;
drop policy if exists mcp_tokens_insert on public.mcp_tokens;
drop policy if exists mcp_tokens_update on public.mcp_tokens;
drop policy if exists mcp_tokens_delete on public.mcp_tokens;
create policy mcp_tokens_select on public.mcp_tokens for select using (auth.uid() = user_id);
create policy mcp_tokens_insert on public.mcp_tokens for insert with check (auth.uid() = user_id);
create policy mcp_tokens_update on public.mcp_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mcp_tokens_delete on public.mcp_tokens for delete using (auth.uid() = user_id);

-- RLS is inert without the grant (see PATCH04). Grant ONLY to authenticated
-- (the /account management surface). Never grant select to anon; never grant
-- to service_role on the MCP path.
grant select, insert, update, delete on public.mcp_tokens to authenticated;

-- ── Request-time resolver ─────────────────────────────────────────────────────
-- Takes a token prefix + hash, and returns ONLY the matching user_id (after
-- bumping last_used_at). SECURITY DEFINER so it can read the table without the
-- table being exposed; it never returns row data or other users' hashes, so it
-- cannot be used as a token-hash oracle. Returns no rows for an
-- expired/revoked/unknown token.
--
-- NOTE (open decision #7, see §5 of the build plan): this returns user_id only.
-- The Next.js route turns that user_id into an RLS-scoped principal by minting a
-- short-lived JWT signed with the project's Supabase JWT secret (server-side
-- only) and passing it to dbForAccessToken(). That JWT-minting step is the
-- load-bearing security primitive and must be signed off before the route ships.
create or replace function public.mcp_resolve_token(p_prefix text, p_hash text)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  update public.mcp_tokens
     set last_used_at = now()
   where token_prefix = p_prefix
     and token_hash = p_hash
     and revoked_at is null
     and expires_at > now()
  returning mcp_tokens.user_id into v_user;

  if v_user is null then
    return;
  end if;

  return query select v_user;
end
$$;

-- Lock the function down, then expose execute to the request-time roles only.
revoke all on function public.mcp_resolve_token(text, text) from public;
grant execute on function public.mcp_resolve_token(text, text) to anon, authenticated;

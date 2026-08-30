-- Hosted MCP — Phase 2 OAuth Authorization-Server state.
--
-- We are the AS (Supabase's native OAuth server is disabled and has no DCR —
-- see docs/ideas/mcp-phase2-oauth-spike.md); Supabase is only the login backend.
-- This migration backs the /authorize + /token + /register front-door:
--   • mcp_oauth_clients  — DCR-registered public clients (claude.ai etc.)
--   • mcp_oauth_codes    — single-use, short-TTL PKCE authorization codes
--   • mcp_oauth_refresh  — rotating, revocable refresh tokens
--
-- Security shape mirrors mcp_tokens (Phase 1): NO direct anon/authenticated
-- grants on these tables; every request-time read/write goes through a
-- SECURITY DEFINER function that returns only what the caller needs. The
-- load-bearing invariant: `user_id` is NEVER a caller-supplied parameter on an
-- anon-callable path. It is derived from either (a) auth.uid() when a logged-in
-- user mints a code, or (b) a just-consumed high-entropy code/refresh secret.
-- That is what stops an anonymous /token caller from forging tokens for an
-- arbitrary user.
--
-- Idempotent and additive.

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.mcp_oauth_clients (
  client_id     text primary key,              -- public, opaque ('mcpc_<base64url>')
  client_name   text,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash      text primary key,             -- sha256(raw code); raw delivered only via redirect
  client_id      text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,                -- PKCE S256 challenge (base64url, no padding)
  scope          text not null default 'mcp:read',
  resource       text,                          -- RFC 8707 resource the client requested
  expires_at     timestamptz not null,         -- single-use + ~60s TTL
  created_at     timestamptz not null default now()
);
create index if not exists mcp_oauth_codes_user_idx on public.mcp_oauth_codes (user_id);

create table if not exists public.mcp_oauth_refresh (
  token_hash  text primary key,                -- sha256(raw refresh token)
  client_id   text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope       text not null default 'mcp:read',
  resource    text,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists mcp_oauth_refresh_user_idx on public.mcp_oauth_refresh (user_id);

-- RLS on, with NO policies/grants for anon: these tables are reachable ONLY
-- through the SECURITY DEFINER functions below (never a raw table read), exactly
-- like mcp_tokens. mcp_oauth_refresh gets owner-scoped SELECT/UPDATE so the
-- /account "Connections" surface can list + revoke OAuth grants under RLS.
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes   enable row level security;
alter table public.mcp_oauth_refresh  enable row level security;

drop policy if exists mcp_oauth_refresh_select on public.mcp_oauth_refresh;
drop policy if exists mcp_oauth_refresh_update on public.mcp_oauth_refresh;
create policy mcp_oauth_refresh_select on public.mcp_oauth_refresh
  for select using (auth.uid() = user_id);
create policy mcp_oauth_refresh_update on public.mcp_oauth_refresh
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, update on public.mcp_oauth_refresh to authenticated;

-- ── Functions ─────────────────────────────────────────────────────────────────

-- DCR: register a public client. Open registration (RFC 7591) — harmless, it
-- binds no user. client_id is generated server-side and passed in.
create or replace function public.mcp_oauth_register_client(
  p_client_id text, p_client_name text, p_redirect_uris text[]
) returns void
language sql security definer set search_path = public as $$
  insert into public.mcp_oauth_clients (client_id, client_name, redirect_uris)
  values (p_client_id, p_client_name, p_redirect_uris)
  on conflict (client_id) do nothing;
$$;

-- Look up a client's registered redirect URIs (for /authorize validation).
-- Returns only this client's row; client_id is already known to the caller.
create or replace function public.mcp_oauth_get_client(p_client_id text)
returns table (redirect_uris text[], client_name text)
language sql security definer set search_path = public as $$
  select redirect_uris, client_name from public.mcp_oauth_clients
  where client_id = p_client_id;
$$;

-- Create an authorization code. AUTHENTICATED ONLY: user_id is auth.uid(), never
-- a parameter, so a code can only ever be minted for the logged-in user.
create or replace function public.mcp_oauth_create_code(
  p_code_hash text, p_client_id text, p_redirect_uri text,
  p_code_challenge text, p_scope text, p_resource text, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.mcp_oauth_codes
    (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
  values
    (p_code_hash, p_client_id, auth.uid(), p_redirect_uri, p_code_challenge, p_scope, p_resource, p_expires_at);
end $$;

-- Redeem an authorization code for tokens (called from /token, UNAUTHENTICATED).
-- Atomically: validates client_id + redirect_uri, verifies PKCE S256 IN SQL,
-- single-use-consumes the code, and issues a refresh row — all bound to the
-- code's user_id (never a caller parameter). Returns the identity the route
-- needs to mint the access token, or no rows on any failure.
create or replace function public.mcp_oauth_redeem_code(
  p_code_hash text, p_verifier text, p_client_id text, p_redirect_uri text,
  p_refresh_hash text, p_refresh_expires_at timestamptz
) returns table (user_id uuid, scope text, resource text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.mcp_oauth_codes%rowtype;
  v_computed text;
begin
  select * into r from public.mcp_oauth_codes
   where code_hash = p_code_hash and expires_at > now();
  if not found then
    return;                                   -- unknown/expired code
  end if;

  -- Single-use: delete now regardless of outcome so a wrong verifier cannot be
  -- retried against the same code.
  delete from public.mcp_oauth_codes where code_hash = p_code_hash;

  if r.client_id <> p_client_id or r.redirect_uri <> p_redirect_uri then
    return;
  end if;

  -- PKCE S256: base64url(sha256(verifier)), no padding == stored challenge.
  v_computed := translate(
    rtrim(replace(encode(extensions.digest(p_verifier, 'sha256'), 'base64'), E'\n', ''), '='),
    '+/', '-_'
  );
  if v_computed <> r.code_challenge then
    return;
  end if;

  insert into public.mcp_oauth_refresh
    (token_hash, client_id, user_id, scope, resource, expires_at)
  values
    (p_refresh_hash, r.client_id, r.user_id, r.scope, r.resource, p_refresh_expires_at);

  return query select r.user_id, r.scope, r.resource;
end $$;

-- Rotate a refresh token (refresh_token grant). Consumes the old (revoke), issues
-- the new, returns the bound identity. user_id comes from the old row (keyed by
-- the high-entropy hash), never a parameter.
create or replace function public.mcp_oauth_rotate_refresh(
  p_old_hash text, p_new_hash text, p_new_expires_at timestamptz
) returns table (user_id uuid, client_id text, scope text, resource text)
language plpgsql security definer set search_path = public as $$
declare
  r public.mcp_oauth_refresh%rowtype;
begin
  select * into r from public.mcp_oauth_refresh
   where token_hash = p_old_hash and revoked_at is null and expires_at > now();
  if not found then
    return;
  end if;
  update public.mcp_oauth_refresh set revoked_at = now() where token_hash = p_old_hash;
  insert into public.mcp_oauth_refresh
    (token_hash, client_id, user_id, scope, resource, expires_at)
  values
    (p_new_hash, r.client_id, r.user_id, r.scope, r.resource, p_new_expires_at);
  return query select r.user_id, r.client_id, r.scope, r.resource;
end $$;

-- Grants: anon may register/lookup/redeem/rotate (the /token + /register paths
-- are unauthenticated by spec); only authenticated may MINT a code (auth.uid()).
revoke all on function public.mcp_oauth_register_client(text, text, text[]) from public;
revoke all on function public.mcp_oauth_get_client(text) from public;
revoke all on function public.mcp_oauth_create_code(text, text, text, text, text, text, timestamptz) from public;
revoke all on function public.mcp_oauth_redeem_code(text, text, text, text, text, timestamptz) from public;
revoke all on function public.mcp_oauth_rotate_refresh(text, text, timestamptz) from public;

grant execute on function public.mcp_oauth_register_client(text, text, text[]) to anon, authenticated;
grant execute on function public.mcp_oauth_get_client(text) to anon, authenticated;
grant execute on function public.mcp_oauth_create_code(text, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.mcp_oauth_redeem_code(text, text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.mcp_oauth_rotate_refresh(text, text, timestamptz) to anon, authenticated;

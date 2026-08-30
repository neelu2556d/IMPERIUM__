-- Hosted MCP — Phase 2 OAuth connection management (/account "Connected apps").
--
-- Lets a user see and revoke the OAuth connections they made from claude.ai /
-- Claude Desktop / mobile, pairing with the Phase-1 vitm_ token revoke. Backed
-- by two SECURITY DEFINER functions over mcp_oauth_refresh (the same no-direct-
-- grant pattern as the rest of the OAuth tables). Both derive the user from
-- auth.uid() — never a parameter — so a user can only ever see/revoke their own
-- grants, and they are authenticated-only.
--
-- Note: revoking kills future refreshes immediately; an already-issued access
-- token is stateless and stays valid until it expires (≤1h), at which point the
-- client can no longer refresh and is fully disconnected.
--
-- Idempotent and additive.

-- List the caller's active OAuth connections, one row per client (a client may
-- hold several refresh tokens over time).
create or replace function public.mcp_oauth_list_connections()
returns table (client_id text, client_name text, connected_at timestamptz, token_count bigint)
language sql security definer set search_path = public as $$
  select r.client_id,
         c.client_name,
         max(r.created_at) as connected_at,
         count(*)          as token_count
  from public.mcp_oauth_refresh r
  left join public.mcp_oauth_clients c on c.client_id = r.client_id
  where r.user_id = auth.uid()
    and r.revoked_at is null
    and r.expires_at > now()
  group by r.client_id, c.client_name
  order by max(r.created_at) desc;
$$;

-- Revoke all of the caller's refresh tokens for one client. Returns the number
-- revoked.
create or replace function public.mcp_oauth_revoke_connection(p_client_id text)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.mcp_oauth_refresh
     set revoked_at = now()
   where user_id = auth.uid() and client_id = p_client_id and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mcp_oauth_list_connections() from public;
revoke all on function public.mcp_oauth_revoke_connection(text) from public;
grant execute on function public.mcp_oauth_list_connections() to authenticated;
grant execute on function public.mcp_oauth_revoke_connection(text) to authenticated;

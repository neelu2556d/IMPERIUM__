-- ============================================================
-- Brand connectors (BUILD50)
--
-- The business-side "plug in your real numbers" layer. A connector is one
-- third-party integration for a brand/venture — Stripe, Shopify, Amazon,
-- YouTube, a website, etc. Two storage tables, both RLS-scoped to the owner:
--
--   brand_connections — one row per (user, provider, brand_ref). Holds the
--     credential (an OAuth token set or an API key), encrypted at rest when
--     CONNECTOR_ENCRYPTION_KEY is configured, plus connection status. This is
--     the brand module's first server-side credential store (it was localStorage
--     + a brand_state jsonb mirror before — precedent: finance's BUILD13 move).
--
--   brand_metrics — append-only time-series of the numbers a sync pulls
--     (revenue, MRR, orders, sales, subscribers, views…). The MCP business
--     briefing reads the latest row per (provider, metric) so Claude sees real,
--     synced figures alongside the user's hand-entered KPIs.
--
-- brand_ref defaults to '' (account-wide) rather than NULL so the uniqueness
-- constraint behaves (NULLs are distinct in a UNIQUE in Postgres).
-- ============================================================

create table public.brand_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null,
  brand_ref      text not null default '',
  auth_type      text not null check (auth_type in ('oauth', 'api_key')),
  -- JSON envelope: { v:1, iv, tag, data } when encrypted, { v:0, data } in dev.
  credentials    jsonb not null,
  account_label  text,
  scopes         text,
  status         text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error     text,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, provider, brand_ref)
);

create index brand_connections_user_idx on public.brand_connections (user_id);

alter table public.brand_connections enable row level security;

create policy "users can read own brand connections"
  on public.brand_connections for select
  using (auth.uid() = user_id);

create policy "users can insert own brand connections"
  on public.brand_connections for insert
  with check (auth.uid() = user_id);

create policy "users can update own brand connections"
  on public.brand_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own brand connections"
  on public.brand_connections for delete
  using (auth.uid() = user_id);

-- ============================================================
-- brand_metrics
-- ============================================================
create table public.brand_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null,
  brand_ref   text not null default '',
  metric      text not null,
  label       text not null,
  value       numeric not null,
  unit        text not null default '',
  period      text not null default 'snapshot' check (period in ('snapshot', 'day', 'month', 'lifetime')),
  captured_at timestamptz not null default now(),
  raw         jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, provider, brand_ref, metric, captured_at)
);

create index brand_metrics_user_provider_idx
  on public.brand_metrics (user_id, provider, captured_at desc);

alter table public.brand_metrics enable row level security;

create policy "users can read own brand metrics"
  on public.brand_metrics for select
  using (auth.uid() = user_id);

create policy "users can insert own brand metrics"
  on public.brand_metrics for insert
  with check (auth.uid() = user_id);

create policy "users can update own brand metrics"
  on public.brand_metrics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own brand metrics"
  on public.brand_metrics for delete
  using (auth.uid() = user_id);

-- Raw CREATE TABLE doesn't auto-grant the API roles (see build02_grants.sql).
grant select, insert, update, delete on table public.brand_connections to anon, authenticated, service_role;
grant select, insert, update, delete on table public.brand_metrics     to anon, authenticated, service_role;

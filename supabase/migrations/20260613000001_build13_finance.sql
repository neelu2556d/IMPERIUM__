-- ============================================================================
-- BUILD13 — Finance module persistence (localStorage -> Supabase)
--
-- Migrates the Finance module off its single localStorage blob
-- (`vitality_finance_v1`) onto multi-user, RLS-scoped Postgres tables.
-- Mirrors the in-memory model in app/app/finance/types.ts. All money is stored
-- as canonical CHF (numeric). Display-currency conversion stays a UI concern.
--
-- Schema decisions (see FINANCE-PHASE3-SCHEMA-PROPOSAL.md):
--   Q1 activity + net-worth history  -> separate tables (idiomatic, append-only)
--   Q2 from_account_id               -> plain uuid column (loose ref, may dangle
--                                        like today; no cross-table FK)
--   Q3 currency preference           -> dedicated finance_prefs table
--   Q4 account type                  -> keep all four (bank/stocks/crypto/other);
--                                        the "manual" relabel is UI-only
--   Q5 activeTab                     -> NOT persisted (ephemeral UI state)
--
-- Client supplies uuids (it already calls crypto.randomUUID), so optimistic UI
-- stays instant; gen_random_uuid() is only a fallback.
--
-- PATCH04 gotcha: raw-SQL migrations do NOT auto-grant anon/authenticated/
-- service_role the way the dashboard does — every table needs explicit GRANTs.
-- ============================================================================

create extension if not exists pgcrypto;

-- Shared updated_at touch trigger (idempotent create).
create or replace function public.finance_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- finance_prefs — one row per user (currency + one-time-import guard)
-- ----------------------------------------------------------------------------
create table if not exists public.finance_prefs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  currency          text not null default 'CHF'
                       check (currency in ('CHF','USD','EUR','GBP')),
  imported_local_at timestamptz,   -- set once the localStorage import runs; guards re-import
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- finance_accounts — bank / stocks / crypto / other (+ stock holdings)
-- ----------------------------------------------------------------------------
create table if not exists public.finance_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('bank','stocks','crypto','other')),
  name          text not null,
  amount_chf    numeric not null default 0,
  ticker        text,                                   -- stocks only
  shares        numeric,                                -- stocks only
  price_history jsonb not null default '[]'::jsonb,     -- [{t,p}] USD, capped 30 client-side
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists finance_accounts_user_idx on public.finance_accounts (user_id);

-- ----------------------------------------------------------------------------
-- finance_subscriptions
-- ----------------------------------------------------------------------------
create table if not exists public.finance_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  amount_chf       numeric not null default 0,
  period           text not null check (period in ('weekly','monthly','yearly')),
  entered_amount   numeric,
  entered_currency text,
  renewal          date,            -- next-renewal anchor (YYYY-MM-DD)
  from_account_id  uuid,            -- loose ref (Q2); may dangle, app handles missing
  auto_deduct      boolean not null default false,
  last_deducted_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists finance_subscriptions_user_idx on public.finance_subscriptions (user_id);

-- ----------------------------------------------------------------------------
-- finance_orders
-- ----------------------------------------------------------------------------
create table if not exists public.finance_orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  amount_chf         numeric not null default 0,
  entered_amount     numeric,
  entered_currency   text,
  from_account_id    uuid,          -- loose ref (Q2)
  arrival_date       date,          -- Order.date (expected arrival)
  deducted_at        timestamptz,   -- null until marked deducted from net worth
  pct_at_deduction   numeric,       -- frozen % of NW at deduction
  deducted_from_name text,          -- snapshot of source account name
  created_at         timestamptz not null default now()   -- Order.ts
);
create index if not exists finance_orders_user_idx on public.finance_orders (user_id);

-- ----------------------------------------------------------------------------
-- finance_wishlist
-- ----------------------------------------------------------------------------
create table if not exists public.finance_wishlist (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  amount_chf       numeric not null default 0,
  entered_amount   numeric,
  entered_currency text,
  created_at       timestamptz not null default now()     -- WishItem.ts
);
create index if not exists finance_wishlist_user_idx on public.finance_wishlist (user_id);

-- ----------------------------------------------------------------------------
-- finance_activity — append-only feed (cap 50 on read)
-- ----------------------------------------------------------------------------
create table if not exists public.finance_activity (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('bank','stocks','crypto','other')),
  name         text not null,
  delta_chf    numeric not null,    -- +added / -removed
  kind         text not null check (kind in ('add','edit','delete')),
  created_at   timestamptz not null default now()
);
create index if not exists finance_activity_user_idx on public.finance_activity (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- finance_net_worth_history — append-only snapshots (cap 500 on read)
-- ----------------------------------------------------------------------------
create table if not exists public.finance_net_worth_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  value_chf   numeric not null,    -- NwHistoryPoint.v
  captured_at timestamptz not null default now()   -- NwHistoryPoint.t
);
create index if not exists finance_nw_history_user_idx on public.finance_net_worth_history (user_id, captured_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers (only on tables that carry updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists finance_prefs_touch on public.finance_prefs;
create trigger finance_prefs_touch before update on public.finance_prefs
  for each row execute function public.finance_touch_updated_at();

drop trigger if exists finance_accounts_touch on public.finance_accounts;
create trigger finance_accounts_touch before update on public.finance_accounts
  for each row execute function public.finance_touch_updated_at();

drop trigger if exists finance_subscriptions_touch on public.finance_subscriptions;
create trigger finance_subscriptions_touch before update on public.finance_subscriptions
  for each row execute function public.finance_touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — every table is owner-scoped to auth.uid().  + explicit GRANTs.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  owner_col text;
  finance_tables text[] := array[
    'finance_prefs',
    'finance_accounts',
    'finance_subscriptions',
    'finance_orders',
    'finance_wishlist',
    'finance_activity',
    'finance_net_worth_history'
  ];
begin
  foreach t in array finance_tables loop
    -- finance_prefs keys on user_id (its PK); the rest also use user_id.
    owner_col := 'user_id';

    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%s owner read" on public.%I;', t, t);
    execute format(
      'create policy "%s owner read" on public.%I for select using (auth.uid() = %I);',
      t, t, owner_col);

    execute format('drop policy if exists "%s owner insert" on public.%I;', t, t);
    execute format(
      'create policy "%s owner insert" on public.%I for insert with check (auth.uid() = %I);',
      t, t, owner_col);

    execute format('drop policy if exists "%s owner update" on public.%I;', t, t);
    execute format(
      'create policy "%s owner update" on public.%I for update using (auth.uid() = %I) with check (auth.uid() = %I);',
      t, t, owner_col, owner_col);

    execute format('drop policy if exists "%s owner delete" on public.%I;', t, t);
    execute format(
      'create policy "%s owner delete" on public.%I for delete using (auth.uid() = %I);',
      t, t, owner_col);

    execute format(
      'grant select, insert, update, delete on table public.%I to anon, authenticated, service_role;',
      t);
  end loop;
end $$;

-- ============================================================================
-- localStorage modules → Supabase write-mirror (goals, supplements, brand)
--
-- Follows BUILD35 (water). These three modules have rich, nested per-user state
-- that the app mutates atomically, so we mirror each as a single jsonb blob
-- (one row per user) rather than bespoke relational tables — the safe, uniform
-- path to MCP-readability. localStorage stays the PRIMARY client store; these
-- are best-effort mirrors. Typed/relational tables + source-of-truth read-back
-- are the later refinement (see docs/builds/BUILD36.md).
--
-- Additive + idempotent.
-- ============================================================================

-- helper: one blob table per module --------------------------------------------
create table if not exists public.goals_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplements_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS + policies (own-row only) ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['goals_state','supplements_state','brand_state'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "read own %1$s" on public.%1$s', t);
    execute format('create policy "read own %1$s" on public.%1$s for select using (auth.uid() = user_id)', t);

    execute format('drop policy if exists "insert own %1$s" on public.%1$s', t);
    execute format('create policy "insert own %1$s" on public.%1$s for insert with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "update own %1$s" on public.%1$s', t);
    execute format('create policy "update own %1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "delete own %1$s" on public.%1$s', t);
    execute format('create policy "delete own %1$s" on public.%1$s for delete using (auth.uid() = user_id)', t);

    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

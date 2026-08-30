-- ============================================================
-- vitals_ingest_tokens  (Phase 4b — Apple/Shortcut ingest)
-- ============================================================
-- Per-user bearer token that an iOS Shortcut (or any external
-- poster) presents to POST /api/vitals/ingest. The raw token is
-- shown to the user once at mint time; only its sha256 hash is
-- stored here. The ingest endpoint runs without a Supabase session,
-- so it looks the token up by hash with the service-role client and
-- maps it back to a user_id, then writes wearable_data (provider
-- 'apple') on that user's behalf.
--
-- Apply this via the Supabase dashboard SQL editor (NOT `db push`).
-- ============================================================

create table public.vitals_ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index vitals_ingest_tokens_user_idx on public.vitals_ingest_tokens (user_id);

alter table public.vitals_ingest_tokens enable row level security;

-- Users manage only their own tokens. The ingest endpoint uses the
-- service-role client (bypasses RLS) for the by-hash lookup.
create policy "users can read own ingest tokens"
  on public.vitals_ingest_tokens for select
  using (auth.uid() = user_id);

create policy "users can insert own ingest tokens"
  on public.vitals_ingest_tokens for insert
  with check (auth.uid() = user_id);

create policy "users can delete own ingest tokens"
  on public.vitals_ingest_tokens for delete
  using (auth.uid() = user_id);

-- Raw SQL migrations must GRANT explicitly (see SKILL.md / PATCH04).
grant select, insert, update, delete on table public.vitals_ingest_tokens
  to anon, authenticated, service_role;

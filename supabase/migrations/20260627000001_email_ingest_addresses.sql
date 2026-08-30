-- ============================================================
-- email_ingest_addresses  (BUILD71 — email-forward wearable ingest)
-- ============================================================
-- Per-user inbound email handle. A user sets a one-time auto-forward
-- rule in their inbox (e.g. "WHOOP/Oura daily email -> forward") to
-- their address  u-<handle>@in.<domain>.  A Cloudflare Email Worker
-- parses the forwarded message and POSTs its parts to
-- /api/wearables/email, which looks the handle up here (service-role,
-- no session), runs the SAME Claude extractor the screenshot importer
-- uses, and writes wearable_data (provider 'manual') on that user's
-- behalf — so it feeds Peak + the Vitals "Manual" band like any source.
--
-- The handle is a routing id that lives in the email address, not a
-- password: stored in plaintext, unique + indexed. The endpoint is
-- ALSO gated by a shared EMAIL_INGEST_SECRET only the Worker holds, so
-- the handle on its own can't be POSTed straight to the route.
--
-- Apply this via the Supabase dashboard SQL editor (NOT `db push`).
-- ============================================================

create table public.email_ingest_addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  handle       text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index email_ingest_addresses_handle_idx on public.email_ingest_addresses (handle);

alter table public.email_ingest_addresses enable row level security;

-- Users read/insert only their own address. The inbound endpoint uses
-- the service-role client (bypasses RLS) for the by-handle lookup.
create policy "users can read own ingest address"
  on public.email_ingest_addresses for select
  using (auth.uid() = user_id);

create policy "users can insert own ingest address"
  on public.email_ingest_addresses for insert
  with check (auth.uid() = user_id);

-- Raw SQL migrations must GRANT explicitly (see SKILL.md / PATCH04).
grant select, insert, update, delete on table public.email_ingest_addresses
  to anon, authenticated, service_role;

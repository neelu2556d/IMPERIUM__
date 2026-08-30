-- Connector external id — the provider-side account/campaign id for a
-- connection, stored in PLAINTEXT (the credential blob is encrypted and can't be
-- queried). Lets server-to-server webhooks (e.g. Patreon) map an inbound event's
-- campaign id back to the owning connection without a user session.
--
-- Idempotent: safe to re-run.

alter table if exists public.brand_connections
  add column if not exists external_id text;

create index if not exists brand_connections_provider_external_idx
  on public.brand_connections (provider, external_id);

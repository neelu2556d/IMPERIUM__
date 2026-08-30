-- ============================================================
-- WHOOP bring-your-own-credentials
-- ============================================================
-- WHOOP won't grant our shared app production access, so instead of one
-- global WHOOP developer app (env WHOOP_CLIENT_ID/SECRET) we let each user
-- bring their own. A user creates their own WHOOP developer app (the app
-- owner can always authorize their own WHOOP account without WHOOP's prod
-- approval) and pastes its client_id + client_secret into Vitality.
--
-- Stored per-user on the existing wearable_connections row (already RLS-
-- scoped to the owner; secrets never leave the server). Plaintext for v1 to
-- match the existing encrypted_* token columns (see lib/whoop/client.ts
-- header) — rotating to encryption-at-rest is the same pre-launch task.
--
-- The credentials row is saved BEFORE the OAuth round-trip, so the token /
-- profile columns can't be NOT NULL anymore — they get filled in at the
-- callback. Relax them to nullable.

alter table public.wearable_connections
  add column if not exists client_id     text,
  add column if not exists client_secret text;

alter table public.wearable_connections alter column provider_user_id        drop not null;
alter table public.wearable_connections alter column encrypted_refresh_token drop not null;
alter table public.wearable_connections alter column encrypted_access_token  drop not null;
alter table public.wearable_connections alter column access_token_expires_at drop not null;

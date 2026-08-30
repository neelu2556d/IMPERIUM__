-- ============================================================
-- Oura bring-your-own-credentials
-- ============================================================
-- Oura's shared developer app is capped to ~10 authorized users while it waits
-- on Oura's approval, so instead of relying on one global Oura app
-- (env OURA_CLIENT_ID/SECRET) we let each user bring their own. A user creates
-- a free Oura developer app (its owner can always authorize their own Oura
-- account without Oura's review) and pastes its client_id + client_secret into
-- Vitality.
--
-- Stored per-user on the existing wearable_connections row (already RLS-scoped
-- to the owner; secrets never leave the server). This reuses the SAME provider-
-- agnostic client_id / client_secret columns that the WHOOP bring-your-own
-- migration (20260620000007_whoop_byo_credentials.sql) added, and the same
-- relaxed (nullable) token columns — so the credentials row can be saved BEFORE
-- the OAuth round-trip and the tokens filled in at the callback.
--
-- Those columns already exist on any DB that ran the WHOOP migration, so the
-- statements below are idempotent no-ops there. They are included only so a DB
-- that somehow reached Oura BYO without the WHOOP migration still ends up with
-- the columns present. Plaintext for v1 to match the encrypted_* token columns
-- (rotating to encryption-at-rest is the same shared pre-launch task).

alter table public.wearable_connections
  add column if not exists client_id     text,
  add column if not exists client_secret text;

alter table public.wearable_connections alter column provider_user_id        drop not null;
alter table public.wearable_connections alter column encrypted_refresh_token drop not null;
alter table public.wearable_connections alter column encrypted_access_token  drop not null;
alter table public.wearable_connections alter column access_token_expires_at drop not null;

-- ============================================================================
-- Finance follow-up — subscription billing link
--
-- Additive + idempotent: safe to run anytime, before OR after the app deploy.
-- Adds one nullable column to finance_subscriptions:
--   manage_url  text  — direct link to the service's billing/manage page
-- RLS + GRANTs are inherited from the table (no policy change needed).
-- ============================================================================

alter table public.finance_subscriptions
  add column if not exists manage_url text;

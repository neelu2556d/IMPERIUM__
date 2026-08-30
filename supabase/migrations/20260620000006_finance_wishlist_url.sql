-- ============================================================================
-- Finance follow-up — wishlist storefront link
--
-- Additive + idempotent: safe to run anytime, before OR after the app deploy.
-- Adds one nullable column to finance_wishlist:
--   url  text  — storefront link for the item (e.g. the Amazon product page)
-- RLS + GRANTs are inherited from the table (no policy change needed).
-- ============================================================================

alter table public.finance_wishlist
  add column if not exists url text;

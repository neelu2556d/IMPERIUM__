-- ============================================================================
-- BUILD13 follow-up — subscription alerts (trial-ending + price-hike)
--
-- Additive + idempotent: safe to run anytime, before OR after the app deploy.
-- Adds three nullable columns to finance_subscriptions:
--   trial_ends           date         — when a free trial converts to paid
--   previous_amount_chf  numeric      — prior price, stamped on a price change
--   price_changed_at     timestamptz  — when the price last changed
-- RLS + GRANTs are inherited from the table (no policy change needed).
-- ============================================================================

alter table public.finance_subscriptions
  add column if not exists trial_ends          date,
  add column if not exists previous_amount_chf numeric,
  add column if not exists price_changed_at    timestamptz;

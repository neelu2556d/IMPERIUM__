-- BUILD22 — Stripe billing schema
--
-- profiles.tier already exists ('free' | 'plus' | 'pro') from BUILD02.
-- This migration adds the columns the Stripe webhook writes to so we
-- can mirror billing state into Supabase and serve tier checks from
-- there (no Stripe round-trip per request).
--
-- stripe_customer_id     one-to-one with auth user. Set on first
--                        checkout via get-or-create. Unique because
--                        Stripe issues one customer per email/user
--                        and we never want to double-create.
-- subscription_status    Mirrors Stripe Subscription.status
--                        ('active' | 'trialing' | 'past_due' |
--                        'canceled' | 'unpaid' | 'incomplete' | …).
--                        Source of truth for the account page badge.
-- current_period_end     Timestamp of the paid period's end. We
--                        keep access until this date even after a
--                        cancel-at-period-end so the user gets what
--                        they paid for.

alter table public.profiles
  add column if not exists stripe_customer_id  text unique,
  add column if not exists subscription_status text,
  add column if not exists current_period_end  timestamptz;

-- Webhook lookup path: incoming event carries customer ID; we map
-- it back to a profile row to update tier/status. This is hot enough
-- to deserve an index.
create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

-- No new RLS policy needed. profiles RLS uses `id = auth.uid()` which
-- covers every column on the row — including the three new ones.
-- The webhook writes via service_role (RLS bypassed for that role).

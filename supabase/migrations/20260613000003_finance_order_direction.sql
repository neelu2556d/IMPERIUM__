-- Income / cash-flow: an order is either spend ('out', default/legacy) or
-- income ('in'). Adds the column to finance_orders so income entries persist
-- to the cloud. Until this runs, income still works locally (localStorage
-- write-through); only its cross-device sync is gated on this column.
--
-- Idempotent and non-destructive: existing rows default to 'out' (unchanged
-- spend behavior). Safe to run alongside the pending sub-alerts migration.

alter table public.finance_orders
  add column if not exists direction text not null default 'out';

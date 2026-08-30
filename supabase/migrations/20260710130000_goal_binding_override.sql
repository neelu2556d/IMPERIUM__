-- Goal binding override (TRAIN 4 "what steers this"): the user's own choice of
-- which metric steers a goal's graph. null = let Vee decide (auto-binding).
-- Values: a guide module name ('weight', 'train', 'finance', 'notes', ...) or
-- 'stream:<canonical_key>' for one of the user's own tile streams.
-- Purely additive; RLS on vitality_goals already scopes reads/writes.
alter table public.vitality_goals
  add column if not exists binding_override text;

comment on column public.vitality_goals.binding_override is
  'User-picked steering metric: guide module name or stream:<canonical_key>; null = Vee decides';

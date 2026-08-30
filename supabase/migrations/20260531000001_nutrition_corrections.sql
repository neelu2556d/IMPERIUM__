-- Learning loop: per-user food correction memory (capture side).
--
-- When a user re-identifies a mislabeled food in the Macros module the UI
-- calls saveCorrection(), which inserts a row here. The vision pipeline
-- (owned separately) reads getRecentCorrections() to build prompt priors so
-- the AI gradually learns the user's food vocabulary.
--
-- Design notes:
--  * No FK to nutrition_meals — the meal may be deleted; the correction signal
--    is still useful. meal_id is a soft reference for debugging.
--  * fdc_id stores the USDA FoodData Central id of the chosen candidate so the
--    prompt-prior layer can pass exact USDA names back to the model.
--  * context stores the meal's what_i_see descriptor to help the model
--    understand which situations trigger the correction (e.g. "rice bowl with
--    chicken" → the user always calls this 'jasmine rice', not 'long-grain').
--  * No updated_at — corrections are immutable; each re-identify creates a
--    fresh row (keeps the full correction history for future training use).

-- ─── nutrition_corrections ─────────────────────────────────────────────────

create table public.nutrition_corrections (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  guessed_name   text,                   -- what the AI originally called the food (nullable: user may add without prior AI guess)
  corrected_name text        not null,   -- what the user changed it to
  fdc_id         bigint,                 -- nullable; USDA FoodData Central id of the chosen candidate
  context        text,                   -- nullable; meal descriptor (what_i_see) to anchor future priors
  meal_id        uuid                    -- nullable; soft reference to the source meal (no FK)
);

create index nutrition_corrections_user_created_idx
  on public.nutrition_corrections (user_id, created_at desc);

alter table public.nutrition_corrections enable row level security;

create policy "users can read own nutrition corrections"
  on public.nutrition_corrections for select
  using (auth.uid() = user_id);

create policy "users can insert own nutrition corrections"
  on public.nutrition_corrections for insert
  with check (auth.uid() = user_id);

grant select, insert on table public.nutrition_corrections
  to anon, authenticated, service_role;

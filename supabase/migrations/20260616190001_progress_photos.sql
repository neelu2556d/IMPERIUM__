-- Progress photos for the Fuel weight section (.03). Stored durably in the
-- user's account (was localStorage-only before), so a photo taken today is
-- still there months later and survives a cache clear / new device.
--
-- The image is a compressed base64 JPEG data URL kept inline (same pattern as
-- nutrition_meals.thumbnail) — simple, no storage bucket / signed URLs, and it
-- rides the same per-user RLS as everything else in Fuel. Photos are immutable
-- (add or delete only), so there is no update policy.

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key text not null,            -- local YYYY-MM-DD when the photo was taken
  image text not null,              -- compressed base64 JPEG data URL
  weight_kg numeric,                -- snapshot of the latest weigh-in at capture
  created_at timestamptz not null default now()
);

create index if not exists progress_photos_user_idx
  on public.progress_photos (user_id, created_at desc);

alter table public.progress_photos enable row level security;

create policy "users can read own progress photos"
  on public.progress_photos for select
  using (auth.uid() = user_id);

create policy "users can insert own progress photos"
  on public.progress_photos for insert
  with check (auth.uid() = user_id);

create policy "users can delete own progress photos"
  on public.progress_photos for delete
  using (auth.uid() = user_id);

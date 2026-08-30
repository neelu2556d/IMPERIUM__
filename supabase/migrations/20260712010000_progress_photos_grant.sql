-- Fix: progress_photos enabled RLS + created read/insert/delete policies but
-- never GRANTED the authenticated role table access, so every query hit
-- "permission denied for table progress_photos" (RLS never even evaluated).
-- This is why progress photos never worked. Grant the role, and add the missing
-- UPDATE policy so editing a photo's note is allowed too.

grant select, insert, update, delete on table public.progress_photos to authenticated, service_role;

drop policy if exists "users can update own progress photos" on public.progress_photos;
create policy "users can update own progress photos"
  on public.progress_photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

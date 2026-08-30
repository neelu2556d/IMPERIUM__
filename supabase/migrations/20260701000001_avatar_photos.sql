-- Profile photos (Arts District identity) + the shared image bucket the custom
-- dashboard background will also use. This is the FIRST Supabase Storage in the
-- project, so it stands up the bucket + its RLS from scratch.
--
-- SECURITY MODEL (folder-per-user):
--   objects live at   avatars/<auth.uid()>/<file>
--   read   = public   (an avatar shows on a public /u/<handle> page + on the
--                       signed-in dashboard; the URL is the only thing exposed)
--   write  = owner     (insert/update/delete only when the FIRST path segment
--                       equals the caller's uid — so no one can touch another
--                       user's folder). Enforced by storage.foldername(name)[1].
-- avatar_url lives on creator_profiles (already public-read-safe: only public
-- columns), never on `profiles` (which holds billing/tier).

-- 1) the URL column on the public identity table
alter table public.creator_profiles
  add column if not exists avatar_url text
    check (avatar_url is null or length(avatar_url) <= 400);

-- 2) the public 'avatars' bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3) RLS on the objects in that bucket (drop-then-create so a re-run / partial
--    prior apply never errors on "policy already exists")
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

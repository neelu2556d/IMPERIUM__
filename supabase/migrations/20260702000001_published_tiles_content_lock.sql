-- Arts District — close the post-approval content-rewrite hole (merge-gate review CRITICAL, 2026-07-02).
--
-- Before: guard_published_tiles_status() only blocked a creator from flipping
-- status to 'approved'. The UPDATE policy still let a creator edit ANY column of
-- their own row, including html/envelope, AFTER it was approved. Attack: publish
-- a benign tile, get it approved (Alex/Sam), then rewrite html/envelope to
-- arbitrary code — every user who adds the "approved" (trusted) tile from then on
-- runs the malicious version, bypassing moderation entirely.
--
-- Fix: any CONTENT edit (html/envelope/name/category) of an already-approved row
-- by a non-service_role caller drops the row back to 'pending', so the changed
-- tile leaves the shop and must be re-moderated before it is served again. The
-- admin approval flip (service_role) is unaffected. Idempotent: replaces the
-- function only; the existing trigger keeps pointing at it.
--
-- NOT YET APPLIED to prod. Apply (after review) the v2-proven safe way:
--   supabase db query --linked -f supabase/migrations/20260702000001_published_tiles_content_lock.sql
-- (NOT `db push` — prod has migration-history drift.)

create or replace function public.guard_published_tiles_status()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  -- No self-approve: a creator can never flip status to 'approved'.
  if new.status is distinct from old.status
     and new.status = 'approved'
     and current_setting('role', true) is distinct from 'service_role'
     and auth.uid() is not null then
    raise exception 'cannot self-approve a published tile';
  end if;

  -- No silent post-approval rewrite: if a non-service_role caller edits the
  -- CONTENT of an already-approved row, drop it back to 'pending' for re-review.
  if old.status = 'approved'
     and current_setting('role', true) is distinct from 'service_role'
     and (new.html is distinct from old.html
          or new.envelope is distinct from old.envelope
          or new.name is distinct from old.name
          or new.category is distinct from old.category) then
    new.status = 'pending';
  end if;

  return new;
end;
$$;

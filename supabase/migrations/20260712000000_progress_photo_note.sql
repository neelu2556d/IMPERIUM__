-- Progress photos: an optional per-photo note.
--
-- Lets a user write a line against each progress photo ("start of cut",
-- "post-holiday", "felt strong today"). Additive + nullable so the app degrades
-- gracefully if this has not landed yet (the note write is error-tolerant).

alter table public.progress_photos
  add column if not exists note text;

comment on column public.progress_photos.note is
  'Optional short user note for this progress photo.';

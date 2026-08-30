-- Born-classified tiles (TRAIN 5 addition).
--
-- A tile can declare, AT BUILD TIME, which of the nine life buckets it serves
-- (the goal-triage categories from lib/goals/categories.ts) plus one line of
-- why it was built ("note for Vee"). Claude passes both through
-- vitality_add_tile / upload_tile; the goal triage and the collection read them
-- later. Deterministic classification at birth - no scanning, no guessing.
--
-- Additive + nullable: every existing row and every caller that does not pass
-- them is untouched. Distinct from the existing `category` column, which is the
-- dashboard's look/shelf category (fitness|health|finance|mind|data).

alter table public.tiles
  add column if not exists goal_category text
    constraint tiles_goal_category_valid check (
      goal_category is null or goal_category in
        ('fitness','health','mind','money','career','craft','audience','people','general')
    );

alter table public.tiles
  add column if not exists vee_note text
    constraint tiles_vee_note_len check (
      vee_note is null or char_length(vee_note) <= 200
    );

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260703000001_studio_tables.sql'),
  'utf8',
).toLowerCase()

describe('studio tables migration', () => {
  test('creates both tables scoped to auth.users on delete cascade', () => {
    expect(sql).toContain('create table if not exists public.studio_videos')
    expect(sql).toContain('create table if not exists public.studio_links')
    const cascades = sql.match(/references auth\.users\(id\) on delete cascade/g) ?? []
    expect(cascades.length).toBe(2)
  })

  test('status and kind are constrained to their enums', () => {
    expect(sql).toContain("check (status in ('draft', 'published', 'archived'))")
    expect(sql).toContain("check (kind in ('social', 'store', 'affiliate', 'other'))")
  })

  test('links cascade-delete with their video', () => {
    expect(sql).toContain('references public.studio_videos(id) on delete cascade')
  })

  test('enables RLS on both tables', () => {
    expect(sql).toContain('alter table public.studio_videos enable row level security')
    expect(sql).toContain('alter table public.studio_links enable row level security')
  })

  test('each table has all four owner policies keyed on auth.uid() = user_id', () => {
    for (const t of ['studio_videos', 'studio_links']) {
      // select + delete use `using`, insert uses `with check`, update uses both.
      // Each assertion is table-scoped (on public.<t> ...) so a policy on one
      // table can never satisfy the check for the other.
      expect(sql).toContain(`on public.${t} for select using (auth.uid() = user_id)`)
      expect(sql).toContain(`on public.${t} for insert with check (auth.uid() = user_id)`)
      expect(sql).toContain(`on public.${t} for update using (auth.uid() = user_id) with check (auth.uid() = user_id)`)
      expect(sql).toContain(`on public.${t} for delete using (auth.uid() = user_id)`)
    }
  })

  test('grants the API roles on both tables (RLS is dead without this)', () => {
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.studio_videos to anon, authenticated, service_role',
    )
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.studio_links  to anon, authenticated, service_role',
    )
  })

  test('indexes both tables on user_id for the common query', () => {
    expect(sql).toContain('on public.studio_videos (user_id, created_at desc)')
    expect(sql).toContain('on public.studio_links (user_id, position)')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260703000002_ai_usage_daily.sql'),
  'utf8',
).toLowerCase()

describe('ai_usage_daily migration', () => {
  test('creates the table scoped to auth.users on delete cascade', () => {
    expect(sql).toContain('create table if not exists public.ai_usage_daily')
    expect(sql).toContain('references auth.users(id) on delete cascade')
  })

  test('day is a plain date column with no default (never derived from now()/current_date)', () => {
    // the column itself carries no default at all: the value must always come
    // from the caller's local-time key, never a server-computed default.
    expect(sql).toContain('day        date not null,')
    expect(sql).not.toMatch(/day\s+date\s+not\s+null\s+default/)
    // the function body legitimately calls now() for updated_at, but the row's
    // day value itself must come from the p_day argument, never a DB default.
    expect(sql).not.toContain('default now()::date')
    expect(sql).not.toContain('default current_date')
  })

  test('count defaults to 0 and there is a unique(user_id, day) constraint', () => {
    expect(sql).toContain('count      integer not null default 0')
    expect(sql).toContain('unique (user_id, day)')
  })

  test('indexes the table on user_id + day for the common lookup', () => {
    expect(sql).toContain('on public.ai_usage_daily (user_id, day)')
  })

  test('enables RLS on the table', () => {
    expect(sql).toContain('alter table public.ai_usage_daily enable row level security')
  })

  test('has all four owner policies keyed on auth.uid() = user_id', () => {
    expect(sql).toContain('on public.ai_usage_daily for select using (auth.uid() = user_id)')
    expect(sql).toContain('on public.ai_usage_daily for insert with check (auth.uid() = user_id)')
    expect(sql).toContain(
      'on public.ai_usage_daily for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
    )
    expect(sql).toContain('on public.ai_usage_daily for delete using (auth.uid() = user_id)')
  })

  test('grants the API roles on the table (RLS is dead without this)', () => {
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.ai_usage_daily to anon, authenticated, service_role',
    )
  })

  test('bump_ai_usage is a security definer RPC that atomically upserts and returns the new count', () => {
    expect(sql).toContain('create or replace function public.bump_ai_usage(p_day date)')
    expect(sql).toContain('returns integer')
    expect(sql).toContain('security definer')
    // pinned search_path is required alongside security definer, otherwise a
    // caller could shadow public.ai_usage_daily via a hostile search_path.
    expect(sql).toContain('set search_path = public')
  })

  test('the RPC scopes the row it touches to the calling session via auth.uid(), never a client-supplied user id', () => {
    // The insert must key off auth.uid(), not any argument the caller controls.
    expect(sql).toContain('values (auth.uid(), p_day, 1)')
    expect(sql).not.toMatch(/p_user_id|user_id\s+uuid\s*,\s*p_day/)
  })

  test('the RPC upserts on the (user_id, day) conflict and increments the existing count', () => {
    expect(sql).toContain('on conflict (user_id, day)')
    expect(sql).toContain('do update set count = ai_usage_daily.count + 1')
    expect(sql).toContain('returning count into new_count')
    expect(sql).toContain('return new_count')
  })

  test('execute on the RPC is granted to authenticated (and service_role), never anon', () => {
    expect(sql).toContain('grant execute on function public.bump_ai_usage(date) to authenticated, service_role')
    expect(sql).not.toMatch(/grant execute on function public\.bump_ai_usage\(date\) to anon/)
  })
})

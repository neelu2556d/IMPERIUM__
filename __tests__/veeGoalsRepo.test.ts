import {
  rowToBigGoal, bigGoalToRow, type BigGoalRow,
  rowToHabitGoal, type HabitGoalRow,
  rowToStreak, streakToRow, type StreakRow,
} from '@/lib/goals/repo'
import { EMPTY_STREAK } from '@/app/app/goals/veeTypes'

describe('vee goals repo mappers', () => {
  const bigRow: BigGoalRow = {
    id: 'g1', user_id: 'u1', title: 'hit 1000 subs on yt',
    clean_title: 'Reach 1,000 Subscribers', category: 'audience',
    target_date: '2026-09-01', priority: '3', push_level: 'push',
    progress_current: '640', progress_target: '1000', progress_unit: 'subs',
    identity_tag: null, status: 'active',
    created_at: '2026-06-18T00:00:00Z', updated_at: '2026-06-18T00:00:00Z', achieved_at: null,
  }

  it('coerces string numerics + maps a big goal', () => {
    const g = rowToBigGoal(bigRow)
    expect(g.priority).toBe(3)
    expect(g.push).toBe('push')
    expect(g.progressCurrent).toBe(640)
    expect(g.progressTarget).toBe(1000)
    expect(g.progressUnit).toBe('subs')
    expect(g.targetDate).toBe('2026-09-01')
    expect(g.status).toBe('active')
    expect(g.cleanTitle).toBe('Reach 1,000 Subscribers')
    expect(g.category).toBe('audience')
  })

  it('maps null category/clean_title to null, and clamps a bogus category to general', () => {
    expect(rowToBigGoal({ ...bigRow, clean_title: null, category: null }).category).toBeNull()
    expect(rowToBigGoal({ ...bigRow, category: 'bogus' }).category).toBe('general')
  })

  it('defaults bad priority/push/status to safe values', () => {
    const g = rowToBigGoal({ ...bigRow, priority: 9 as unknown as number, push_level: 'bogus', status: 'weird' })
    expect(g.priority).toBe(2)
    expect(g.push).toBe('balanced')
    expect(g.status).toBe('active')
  })

  it('bigGoalToRow drops server-managed fields + applies defaults', () => {
    const row = bigGoalToRow({ title: 'Run a half marathon' }, 'u1')
    expect(row).toMatchObject({ user_id: 'u1', title: 'Run a half marathon', priority: 2, push_level: 'balanced', status: 'active' })
    expect('id' in row).toBe(false)
    expect('created_at' in row).toBe(false)
  })

  it('maps a manual habit goal (null tracking)', () => {
    const row: HabitGoalRow = {
      id: 'h1', user_id: 'u1', parent_goal_id: null, title: 'Meditate 10 minutes',
      kind: 'habit', due_date: null, difficulty: null, estimated_minutes: 10,
      suggested_start_hour: null, when_cue: null, source: null, tracking: null,
      status: 'open', is_tomorrow: false, push_count: 0, last_pushed_at: null,
      created_at: '2026-06-18T00:00:00Z', completed_at: null,
    }
    const h = rowToHabitGoal(row)
    expect(h.kind).toBe('habit')
    expect(h.tracking).toBeNull()
    expect(h.isTomorrow).toBe(false)
    expect(h.pushCount).toBe(0)
  })

  it('maps an auto-tracked habit goal (tracking spec preserved)', () => {
    const row: HabitGoalRow = {
      id: 'h2', user_id: 'u1', parent_goal_id: 'g1', title: 'Train 4 times a week',
      kind: 'habit', due_date: null, difficulty: null, estimated_minutes: null,
      suggested_start_hour: '10', when_cue: null, source: 'auto',
      tracking: { metric: 'train', target: 4, window: 'week' },
      status: 'open', is_tomorrow: false, push_count: 2, last_pushed_at: null,
      created_at: '2026-06-18T00:00:00Z', completed_at: null,
    }
    const h = rowToHabitGoal(row)
    expect(h.source).toBe('auto')
    expect(h.tracking).toEqual({ metric: 'train', target: 4, window: 'week' })
    expect(h.suggestedStartHour).toBe(10)
    expect(h.parentGoalId).toBe('g1')
  })

  it('streak: empty when no row, round-trips otherwise', () => {
    expect(rowToStreak(null)).toEqual(EMPTY_STREAK)
    const row: StreakRow = { user_id: 'u1', current: 5, longest: 12, last_extended_date: '2026-06-17', freezes: 1, freezes_used: 3 }
    const s = rowToStreak(row)
    expect(s).toEqual({ current: 5, longest: 12, lastExtendedDate: '2026-06-17', freezes: 1, freezesUsed: 3 })
    expect(streakToRow(s, 'u1')).toMatchObject({ user_id: 'u1', current: 5, longest: 12, last_extended_date: '2026-06-17', freezes: 1, freezes_used: 3 })
  })
})

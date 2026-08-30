import { shapeGoals, type BigGoal } from '@/mcp/src/queries'

// Pure mapping layer for the MCP goals tool (BUILD50): turns the three
// authoritative tables (vitality_goals / vitality_habit_goals / goals_streak)
// into GoalsData. This is the bug-prone part — getGoals is a thin DB wrapper
// around it. completed_at fixtures use timezone-naive local datetimes so the
// local-date-key derivation is deterministic regardless of the CI timezone.

const TODAY = '2026-06-19'
const TOMORROW = '2026-06-20'

describe('shapeGoals — big personal goals', () => {
  const bigRows = [
    // intentionally out of order to exercise the sort
    { title: 'Hit 1,000 subs', clean_title: null, category: 'audience', target_date: null, priority: 2, push_level: 'balanced', progress_current: 640, progress_target: 1000, progress_unit: 'subs', identity_tag: null, status: 'active' },
    { title: 'Read 12 books', target_date: '2026-12-31', priority: 1, push_level: 'gentle', status: 'active' },
    { title: 'PR squat 140kg', clean_title: 'Squat 140 kg', category: 'fitness', target_date: TOMORROW, priority: 3, push_level: 'push', progress_current: 130, progress_target: 140, progress_unit: 'kg', identity_tag: 'a lifter', status: 'active' },
  ]
  const g = shapeGoals(bigRows, [], { current: 5, longest: 9 }, TODAY, TOMORROW)

  test('hasData true and streak mapped from goals_streak row', () => {
    expect(g.hasData).toBe(true)
    expect(g.streakCurrent).toBe(5)
    expect(g.streakLongest).toBe(9)
  })

  test('sorts soonest-dated first, undated last', () => {
    expect(g.bigGoals.map((b) => b.rawTitle)).toEqual(['PR squat 140kg', 'Read 12 books', 'Hit 1,000 subs'])
  })

  test('prefers clean_title, keeps rawTitle, maps priority + push + identity', () => {
    const squat = g.bigGoals[0]
    expect(squat.title).toBe('Squat 140 kg')
    expect(squat.rawTitle).toBe('PR squat 140kg')
    expect(squat.priority).toBe('high')
    expect(squat.pushLevel).toBe('push')
    expect(squat.identityTag).toBe('a lifter')
    expect(squat.category).toBe('fitness')
  })

  test('computes days-until-target and progress percentage', () => {
    const squat = g.bigGoals[0]
    expect(squat.targetDate).toBe(TOMORROW)
    expect(squat.daysUntilTarget).toBe(1)
    expect(squat.progress).toEqual({ current: 130, target: 140, unit: 'kg', pct: 93 })
  })

  test('undated goal has null target + null daysUntil, progress still computed', () => {
    const subs = g.bigGoals[2]
    expect(subs.targetDate).toBeNull()
    expect(subs.daysUntilTarget).toBeNull()
    expect(subs.progress).toEqual({ current: 640, target: 1000, unit: 'subs', pct: 64 })
  })

  test('goal with no progress numbers yields null progress', () => {
    const books = g.bigGoals[1]
    expect(books.progress).toBeNull()
    expect(books.priority).toBe('low')
  })

  test('overdue target yields a negative daysUntilTarget', () => {
    const od = shapeGoals([{ title: 'Late goal', target_date: '2026-06-17', priority: 2, push_level: 'balanced', status: 'active' }], [], null, TODAY, TOMORROW)
    expect((od.bigGoals[0] as BigGoal).daysUntilTarget).toBe(-2)
  })
})

describe('shapeGoals — habit goals (this week)', () => {
  const habitRows = [
    { title: 'Drink water', kind: 'habit', due_date: TODAY, status: 'open' },
    { title: 'Meditate', kind: 'habit', due_date: TODAY, status: 'completed', completed_at: '2026-06-19T12:00:00' },
    { title: 'Old task', kind: 'task', due_date: '2026-06-18', status: 'completed', completed_at: '2026-06-19T09:00:00' },
    { title: 'Plan week', kind: 'task', due_date: TOMORROW, status: 'open' },
    { title: 'Archived thing', kind: 'task', due_date: TODAY, status: 'archived' },
    { title: 'Tomorrow flagged', kind: 'task', due_date: null, is_tomorrow: true, status: 'open' },
  ]
  const g = shapeGoals([], habitRows, { current: 2, longest: 2 }, TODAY, TOMORROW)

  test('counts due-today (live rows), completed-today, and open habit goals', () => {
    expect(g.dueToday).toBe(2) // Drink water + Meditate (archived excluded)
    expect(g.completedToday).toBe(2) // Meditate + Old task (both completed today)
    expect(g.activeGoals).toBe(3) // Drink water + Plan week + Tomorrow flagged
  })

  test('due-today list is open-only, archived excluded', () => {
    expect(g.dueTodayGoals.map((x) => x.title)).toEqual(['Drink water'])
  })

  test('due-tomorrow includes dated-tomorrow and is_tomorrow-flagged (open only)', () => {
    expect(g.dueTomorrowGoals.map((x) => x.title).sort()).toEqual(['Plan week', 'Tomorrow flagged'])
  })
})

describe('shapeGoals — empty state', () => {
  test('all-empty yields hasData false and zeroed counts', () => {
    const g = shapeGoals([], [], null, TODAY, TOMORROW)
    expect(g.hasData).toBe(false)
    expect(g).toMatchObject({ streakCurrent: 0, streakLongest: 0, activeGoals: 0, dueToday: 0, completedToday: 0, bigGoals: [], dueTodayGoals: [], dueTomorrowGoals: [] })
  })

  test('a streak row alone counts as data', () => {
    expect(shapeGoals([], [], { current: 3, longest: 3 }, TODAY, TOMORROW).hasData).toBe(true)
  })
})

import { liftStallConcerns } from '@/lib/oracle/concerns'
import type { ActiveGoal } from '@/lib/oracle/greenlight'
import type { LiftSession } from '@/mcp/src/insights'

// Turn a goal-matched, stalled lift into a real "concern" the green-light engine
// can converge on. The whole point: a concern only exists when a stall is tied to
// a goal the user actually set. A stall with no goal at stake produces nothing.

const STALLED: LiftSession[] = [
  { date: '2026-06-01', topWeight: 170, topReps: 5 },
  { date: '2026-06-04', topWeight: 175, topReps: 5 },
  { date: '2026-06-07', topWeight: 180, topReps: 5 },
  { date: '2026-06-10', topWeight: 180, topReps: 5 },
  { date: '2026-06-14', topWeight: 180, topReps: 4 },
  { date: '2026-06-18', topWeight: 180, topReps: 5 },
]
const CLIMBING: LiftSession[] = [
  { date: '2026-06-01', topWeight: 170, topReps: 5 },
  { date: '2026-06-08', topWeight: 175, topReps: 5 },
  { date: '2026-06-15', topWeight: 180, topReps: 5 },
]

const benchGoal: ActiveGoal = { id: 'g1', title: 'bench 225', push: 'normal' }
const leanGoal: ActiveGoal = { id: 'g2', title: 'get lean', push: 'normal' }
const benchLift = (sessions: LiftSession[]) => [{ id: 'bench_bb', name: 'Bench Press', sessions }]

describe('liftStallConcerns', () => {
  test('a stalled lift tied to a goal becomes one train concern', () => {
    const c = liftStallConcerns([benchGoal], benchLift(STALLED))
    expect(c).toHaveLength(1)
    expect(c[0].domain).toBe('train')
    expect(c[0].goalRefs).toEqual(['g1'])
    expect(c[0].receipt.kind).toBe('lift-stall')
    expect(c[0].receipt.text).toContain('180')
    expect(c[0].margin).toBeGreaterThan(0)
  })

  test('a climbing lift produces no concern', () => {
    expect(liftStallConcerns([benchGoal], benchLift(CLIMBING))).toEqual([])
  })

  test('a goal that is not about any lift produces no concern', () => {
    expect(liftStallConcerns([leanGoal], benchLift(STALLED))).toEqual([])
  })

  test('a stalled lift with no goal pointing at it produces nothing', () => {
    const squatGoal: ActiveGoal = { id: 'g3', title: 'squat 315', push: 'normal' }
    expect(liftStallConcerns([squatGoal], benchLift(STALLED))).toEqual([])
  })

  test('a silent goal never raises a concern', () => {
    const silent: ActiveGoal = { ...benchGoal, push: 'silent' }
    expect(liftStallConcerns([silent], benchLift(STALLED))).toEqual([])
  })
})

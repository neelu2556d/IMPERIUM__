import { matchGoalToLift } from '@/lib/oracle/goalMatch'

// The bridge that makes a notice "tied to a goal": connect a freeform strength
// goal ("bench 225") to the lift it's about, among the lifts the user actually
// trains. Pure + forgiving, but never a false match (a goal about no logged lift
// returns null, so we never claim a stall on a lift they don't do).

const LIFTS = [
  { id: 'bench_bb', name: 'Bench Press' },
  { id: 'squat_bb', name: 'Squat' },
  { id: 'ohp_bb', name: 'Overhead Press' },
]

describe('matchGoalToLift', () => {
  test('matches a bench goal to the bench lift and pulls the target weight', () => {
    expect(matchGoalToLift('bench 225', LIFTS)).toEqual({
      liftId: 'bench_bb',
      liftName: 'Bench Press',
      targetWeight: 225,
    })
  })

  test('matches a squat goal and reads the number even with a unit suffix', () => {
    const m = matchGoalToLift('squat 140kg', LIFTS)
    expect(m!.liftId).toBe('squat_bb')
    expect(m!.targetWeight).toBe(140)
  })

  test('prefers the more specific lift when tokens overlap', () => {
    // both "Bench Press" and "Overhead Press" share "press"; the extra "overhead"
    // token should win it for the OHP.
    expect(matchGoalToLift('overhead press 135', LIFTS)!.liftId).toBe('ohp_bb')
  })

  test('returns null for a non-lift goal', () => {
    expect(matchGoalToLift('get lean, 12% body fat', LIFTS)).toBeNull()
  })

  test('returns null when the goal names a lift the user does not train', () => {
    expect(matchGoalToLift('deadlift 405', LIFTS)).toBeNull()
  })

  test('matches without a number, leaving targetWeight null', () => {
    expect(matchGoalToLift('improve my bench', LIFTS)).toEqual({
      liftId: 'bench_bb',
      liftName: 'Bench Press',
      targetWeight: null,
    })
  })
})

import { deriveGoalMode, weightsForMode, goalLabel, type GoalMode } from '@/lib/nutrition/goalContext'

const MODES: GoalMode[] = ['lose', 'build', 'balanced']

describe('goalContext weights', () => {
  it('every mode sums to exactly 10 with each weight in 1..4', () => {
    for (const m of MODES) {
      const w = weightsForMode(m)
      const sum = w.protein + w.calories + w.wholefoods + w.micros
      expect(sum).toBe(10)
      for (const v of [w.protein, w.calories, w.wholefoods, w.micros]) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(4)
      }
    }
  })

  it('lose mode grades calories heavier than protein (Alex example)', () => {
    const w = weightsForMode('lose')
    expect(w.calories).toBeGreaterThan(w.protein)
  })

  it('build keeps protein the top row', () => {
    const w = weightsForMode('build')
    expect(w.protein).toBeGreaterThanOrEqual(w.calories)
    expect(w.protein).toBe(4)
  })
})

describe('deriveGoalMode', () => {
  it('maps the goal_outcome strings', () => {
    expect(deriveGoalMode({ goalOutcome: 'CUT' })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: 'CUT_HP' })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: 'RECOMP' })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: 'RECOMP_MAINTAIN' })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: 'LEAN_BULK' })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: 'FAST_BULK' })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: 'MAINTAIN' })).toBe('balanced')
  })

  it('falls back to the signed band, then balanced, and never throws', () => {
    expect(deriveGoalMode({ goalOutcome: null, bandMidKgPerWeek: -0.3 })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: '', bandMidKgPerWeek: 0.3 })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: 'something-weird', bandMidKgPerWeek: 0 })).toBe('balanced')
    expect(deriveGoalMode({})).toBe('balanced')
  })

  it('goalLabel returns a non-empty phrase per mode', () => {
    for (const m of MODES) expect(goalLabel(m).length).toBeGreaterThan(0)
  })
})

describe('deriveGoalMode honors the Vee goal (hand in hand with the goals tab)', () => {
  it('uses the Vee goal when no nutrition outcome is set', () => {
    expect(deriveGoalMode({ goalOutcome: null, bigGoal: { title: 'Lose weight for summer' } })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: null, bigGoal: { title: 'Get leaner and stronger' } })).toBe('build')
    expect(deriveGoalMode({ goalOutcome: null, bigGoal: { identityTag: 'a lifter' } })).toBe('build')
  })

  it('a Vee goal overrides a neutral MAINTAIN nutrition outcome', () => {
    expect(deriveGoalMode({ goalOutcome: 'MAINTAIN', bigGoal: { title: 'lose weight' } })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: 'MAINTAIN', bigGoal: { title: 'build muscle' } })).toBe('build')
  })

  it('an explicit nutrition cut/bulk still wins over the Vee goal', () => {
    expect(deriveGoalMode({ goalOutcome: 'CUT', bigGoal: { title: 'build muscle' } })).toBe('lose')
    expect(deriveGoalMode({ goalOutcome: 'LEAN_BULK', bigGoal: { title: 'lose weight' } })).toBe('build')
  })

  it('a non-fitness or vague Vee goal does not flip the grade', () => {
    expect(deriveGoalMode({ goalOutcome: 'MAINTAIN', bigGoal: { title: 'Read 12 books', category: 'craft' } })).toBe('balanced')
    expect(deriveGoalMode({ bigGoal: { category: 'fitness' } })).toBe('balanced')
  })
})

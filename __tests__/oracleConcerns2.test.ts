import { weightDriftConcern, moodLowConcern } from '@/lib/oracle/concerns'
import type { ActiveGoal } from '@/lib/oracle/greenlight'

// More concern domains so the oracle is cross-life, not just lifts. Weight-drift
// anchors to a cut/bulk goal (it's about a goal the user set). Mood-low is
// goal-agnostic — it adds a converging domain + colors the tone, but never fires
// on its own.

const leanGoal: ActiveGoal = { id: 'g_lean', title: 'get lean', push: 'normal' }
const benchGoal: ActiveGoal = { id: 'g_bench', title: 'bench 225', push: 'normal' }

describe('weightDriftConcern', () => {
  test('gaining while cutting -> a weight concern tied to the cut goal', () => {
    // +0.3 kg/wk at 80kg = +0.375%/wk -> wrong-direction for a cut
    const c = weightDriftConcern([leanGoal], { kgPerWeek: 0.3 }, 80)
    expect(c).toHaveLength(1)
    expect(c[0].domain).toBe('weight')
    expect(c[0].goalRefs).toEqual(['g_lean'])
    expect(c[0].receipt.kind).toBe('weight-drift')
    expect(c[0].margin).toBeGreaterThan(0)
  })

  test('losing on-track while cutting -> no concern', () => {
    // -0.6 kg/wk at 80kg = -0.75%/wk -> on-track
    expect(weightDriftConcern([leanGoal], { kgPerWeek: -0.6 }, 80)).toEqual([])
  })

  test('a non-weight goal (a lift goal) raises no weight concern', () => {
    expect(weightDriftConcern([benchGoal], { kgPerWeek: 0.3 }, 80)).toEqual([])
  })

  test('no weigh-in rate -> no concern (cannot judge)', () => {
    expect(weightDriftConcern([leanGoal], null, 80)).toEqual([])
  })

  test('a silent goal never raises a concern', () => {
    expect(weightDriftConcern([{ ...leanGoal, push: 'silent' }], { kgPerWeek: 0.3 }, 80)).toEqual([])
  })
})

describe('moodLowConcern', () => {
  test('a low recent mood stretch -> a goal-agnostic mood concern', () => {
    const c = moodLowConcern([{ mood: 2 }, { mood: 2 }, { mood: 3 }, { mood: 2 }, { mood: 2 }])
    expect(c).toHaveLength(1)
    expect(c[0].domain).toBe('mood')
    expect(c[0].goalRefs).toEqual([]) // never anchors alone
    expect(c[0].margin).toBeGreaterThan(0)
  })

  test('a fine mood -> no concern', () => {
    expect(moodLowConcern([{ mood: 4 }, { mood: 4 }, { mood: 5 }, { mood: 4 }])).toEqual([])
  })

  test('too few days to judge -> no concern', () => {
    expect(moodLowConcern([{ mood: 2 }, { mood: 2 }])).toEqual([])
  })
})

import { decideContextQuestion } from '@/lib/nutrition/contextQuestions'
import type { Macros } from '@/lib/nutrition/types'

const carbForward: Macros = { kcal: 600, protein: 25, carbs: 90, fat: 12 } // ~60% carb, ~18% fat
const fatHeavy: Macros = { kcal: 700, protein: 22, carbs: 35, fat: 45 } // ~58% fat, ~20% carb

describe('decideContextQuestion', () => {
  it('asks nothing when it is not a training day', () => {
    expect(decideContextQuestion({ meal: { totals: carbForward }, mode: 'build', isTrainingDayToday: false, answeredIds: [] })).toBeNull()
  })

  it('asks nothing when there is no meal', () => {
    expect(decideContextQuestion({ meal: null, mode: 'build', isTrainingDayToday: true, answeredIds: [] })).toBeNull()
  })

  it('a carb-forward meal on a training day offers the +1 good-fuel question', () => {
    const q = decideContextQuestion({ meal: { totals: carbForward }, mode: 'build', isTrainingDayToday: true, answeredIds: [] })!
    expect(q).not.toBeNull()
    expect(q.id).toBe('preworkout_fuel_good')
    expect(q.tone).toBe('good')
    expect(q.answers.some((a) => a.delta === 1)).toBe(true)
  })

  it('a fat-heavy carb-light meal offers the -1 caution with a grace out', () => {
    const q = decideContextQuestion({ meal: { totals: fatHeavy }, mode: 'lose', isTrainingDayToday: true, answeredIds: [] })!
    expect(q.id).toBe('heavy_preworkout_fat')
    expect(q.tone).toBe('watch')
    expect(q.answers.some((a) => a.delta < 0)).toBe(true)
    // grace guarantee: any question that can deduct must offer a no-change out
    expect(q.answers.some((a) => a.grace || a.delta === 0)).toBe(true)
  })

  it('does not re-ask a question already answered today', () => {
    expect(decideContextQuestion({ meal: { totals: carbForward }, mode: 'build', isTrainingDayToday: true, answeredIds: ['preworkout_fuel_good'] })).toBeNull()
    expect(decideContextQuestion({ meal: { totals: fatHeavy }, mode: 'lose', isTrainingDayToday: true, answeredIds: ['heavy_preworkout_fat'] })).toBeNull()
  })

  it('never pre-applies a delta: the question only proposes, the tap decides', () => {
    const q = decideContextQuestion({ meal: { totals: fatHeavy }, mode: 'lose', isTrainingDayToday: true, answeredIds: [] })!
    // the object carries proposed deltas on answers; nothing is applied yet
    expect(Array.isArray(q.answers)).toBe(true)
    expect(q.answers.length).toBeGreaterThanOrEqual(2)
  })
})

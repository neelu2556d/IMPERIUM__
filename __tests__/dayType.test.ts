/**
 * Tests for gym/rest day-type target selection (lib/nutrition/dayType.ts).
 * The tracker shows the gym-day or rest-day target depending on how the user
 * marked the day; plans without a cycle (maintenance / no lifting) always get
 * the single base target with no toggle.
 */

import { targetForDay, dayTypeFor, DEFAULT_DAY_TYPE } from '@/lib/nutrition/dayType'
import type { NutritionGoals } from '@/lib/nutrition/types'

const base: NutritionGoals = {
  kcalTarget: 2720,
  proteinTarget: 135,
  carbsTarget: 374,
  fatTarget: 76,
  searchMode: 'basic',
  onboarded: true,
  cycleEnabled: true,
  training: { kcal: 3020, protein: 135, carbs: 449, fat: 76 },
  rest: { kcal: 2320, protein: 135, carbs: 274, fat: 76 },
  approach: 'CUT',
  activity: 'sedentary',
  trainingDays: 4,
  goalBand: { lowKgPerWeek: -0.4, highKgPerWeek: -0.2 },
  adaptiveEnabled: true,
  bodyFatPct: null,
  fiberTarget: null,
  sugarLimitG: null,
  sodiumLimitMg: null,
}

describe('targetForDay', () => {
  it('returns the training-day target for a gym day', () => {
    expect(targetForDay(base, 'gym')).toEqual({ kcal: 3020, protein: 135, carbs: 449, fat: 76 })
  })

  it('returns the rest-day target for a rest day', () => {
    expect(targetForDay(base, 'rest')).toEqual({ kcal: 2320, protein: 135, carbs: 274, fat: 76 })
  })

  it('never shows the blended base when a cycle exists', () => {
    expect(targetForDay(base, 'gym').kcal).not.toBe(base.kcalTarget)
    expect(targetForDay(base, 'rest').kcal).not.toBe(base.kcalTarget)
  })

  it('falls back to the base target when cycling is disabled', () => {
    const noCycle: NutritionGoals = { ...base, cycleEnabled: false }
    expect(targetForDay(noCycle, 'gym')).toEqual({ kcal: 2720, protein: 135, carbs: 374, fat: 76 })
    expect(targetForDay(noCycle, 'rest')).toEqual({ kcal: 2720, protein: 135, carbs: 374, fat: 76 })
  })

  it('falls back to the base target when cycle data is missing', () => {
    const partial: NutritionGoals = { ...base, training: null, rest: null }
    expect(targetForDay(partial, 'gym').kcal).toBe(2720)
  })

  it('coerces null carbs/fat to 0 in the no-cycle fallback', () => {
    const nullable: NutritionGoals = { ...base, cycleEnabled: false, carbsTarget: null, fatTarget: null }
    expect(targetForDay(nullable, 'gym')).toEqual({ kcal: 2720, protein: 135, carbs: 0, fat: 0 })
  })
})

describe('dayTypeFor', () => {
  it('uses the stored mark when present', () => {
    expect(dayTypeFor({ '2026-06-05': 'rest' }, '2026-06-05')).toBe('rest')
  })

  it('defaults an unmarked day to a gym day', () => {
    expect(dayTypeFor({}, '2026-06-05')).toBe(DEFAULT_DAY_TYPE)
    expect(DEFAULT_DAY_TYPE).toBe('gym')
  })
})

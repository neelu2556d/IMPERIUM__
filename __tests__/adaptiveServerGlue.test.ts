/**
 * Tests for the pure server-glue adapters around the adaptive engine:
 * week-key cadence, meal aggregation, accepted-target patch, coach fragment.
 */

import { weekStartKey } from '@/lib/nutrition/week'
import { toWeighIns, toDailyKcal } from '@/lib/nutrition/adaptiveInputs'
import { acceptedGoalPatch } from '@/lib/nutrition/applyCheckin'
import { collectAdaptiveCheckin } from '@/lib/coach/collectors'
import { DEFAULT_GOALS } from '@/app/app/fuel/macros/serialize'
import type { NutritionGoals } from '@/lib/nutrition/types'
import type { Checkin } from '@/lib/nutrition/adaptive'

describe('weekStartKey', () => {
  it('returns the local Monday for a midweek date', () => {
    // 2026-06-03 is a Wednesday -> Monday 2026-06-01
    expect(weekStartKey(new Date(2026, 5, 3))).toBe('2026-06-01')
  })
  it('treats Sunday as the end of the week (previous Monday)', () => {
    // 2026-06-07 is a Sunday -> Monday 2026-06-01
    expect(weekStartKey(new Date(2026, 5, 7))).toBe('2026-06-01')
  })
  it('returns the same day when it is already Monday', () => {
    expect(weekStartKey(new Date(2026, 5, 1))).toBe('2026-06-01')
  })
})

describe('toWeighIns / toDailyKcal', () => {
  it('maps weight entries to engine weigh-ins', () => {
    expect(toWeighIns([{ dayKey: '2026-06-01', kg: 80.2 }])).toEqual([{ date: '2026-06-01', weightKg: 80.2 }])
  })
  it('sums multiple meals on the same day into one daily total', () => {
    const out = toDailyKcal([
      { dayKey: '2026-06-01', totals: { kcal: 600 } },
      { dayKey: '2026-06-01', totals: { kcal: 700 } },
      { dayKey: '2026-06-02', totals: { kcal: 1900 } },
    ])
    const byDay = Object.fromEntries(out.map((d) => [d.dayKey, d.kcal]))
    expect(byDay['2026-06-01']).toBe(1300)
    expect(byDay['2026-06-02']).toBe(1900)
  })
})

describe('acceptedGoalPatch', () => {
  it('shifts a single (no-cycle) target and absorbs the delta into carbs', () => {
    const goals: NutritionGoals = {
      ...DEFAULT_GOALS,
      kcalTarget: 2200,
      proteinTarget: 180,
      carbsTarget: 200,
      fatTarget: 70,
      cycleEnabled: false,
    }
    const patch = acceptedGoalPatch(goals, 2050) // -150 kcal -> -37.5 g carbs, round(162.5)=163
    expect(patch.kcal_target).toBe(2050)
    expect(patch.protein_target).toBe(180)
    expect(patch.fat_target).toBe(70)
    expect(patch.carbs_target).toBe(163)
  })

  it('re-splits a cycle to the new weekly average, preserving the gap', () => {
    const goals: NutritionGoals = {
      ...DEFAULT_GOALS,
      kcalTarget: 2720,
      cycleEnabled: true,
      training: { kcal: 3020, protein: 135, carbs: 449, fat: 76 },
      rest: { kcal: 2320, protein: 135, carbs: 274, fat: 76 },
      trainingDays: 4,
    }
    const patch = acceptedGoalPatch(goals, 2620) // -100 weekly avg
    expect(patch.kcal_target).toBe(2620)
    const newAvg = (4 * (patch.training_kcal as number) + 3 * (patch.rest_kcal as number)) / 7
    expect(newAvg).toBeCloseTo(2620, 0)
    expect((patch.training_kcal as number) - (patch.rest_kcal as number)).toBe(3020 - 2320)
  })
})

describe('collectAdaptiveCheckin', () => {
  const base: Checkin = {
    status: 'too_fast',
    trendRateKgPerWeek: 0.5,
    maintenanceKcal: 2600,
    avgKcal: 2100,
    suggestedKcal: 2050,
    deltaKcal: -150,
    logScaleGap: null,
    reason: '',
  }

  it('returns null for no check-in', () => {
    expect(collectAdaptiveCheckin(null)).toBeNull()
  })

  it('summarizes the suggestion in calories and never leaks raw kg', () => {
    const f = collectAdaptiveCheckin(base)!
    expect(f).toContain('2050')
    expect(f.toLowerCase()).toContain('climbing')
    expect(f).not.toMatch(/kg/i) // qualitative trend only, no kg to the coach
  })

  it('tells the coach to trust the scale when the log reads light', () => {
    const f = collectAdaptiveCheckin({ ...base, logScaleGap: 300 })!
    expect(f.toLowerCase()).toContain('scale')
    expect(f.toLowerCase()).not.toContain('lying')
  })

  it('reports calibrating without a number', () => {
    const f = collectAdaptiveCheckin({ ...base, status: 'calibrating', suggestedKcal: null, deltaKcal: null, maintenanceKcal: null, daysUntilFirstRead: 6 })!
    expect(f.toLowerCase()).toContain('calibrat')
    expect(f).toContain('6')
  })
})

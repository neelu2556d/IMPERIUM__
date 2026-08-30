/**
 * Tests for the macro calculator (Fuel spec, Part B): maintenance estimate
 * (Mifflin / Katch + the non-gym-lifestyle + training activity model), the
 * decision table, rate-based offsets with safety floors/caps, FFM-keyed protein,
 * the fat floor, and the training/rest carb cycle (weekly average preserved).
 */

import {
  bmr,
  estimateMaintenance,
  effectiveActivityFactor,
  recommendApproach,
  computeMacros,
  defaultRate,
  type MacroInput,
  type ApproachInput,
} from '@/lib/nutrition/macroCalc'

describe('maintenance estimate', () => {
  it('Mifflin BMR for 80kg/178cm/30y male is 1768', () => {
    expect(bmr('M', 30, 178, 80)).toBe(1768)
  })
  it('female offset lowers BMR', () => {
    expect(bmr('F', 30, 178, 80)).toBeLessThan(bmr('M', 30, 178, 80))
  })
  it('Katch-McArdle only when a measured body fat % is given', () => {
    const mifflin = bmr('M', 30, 178, 80)
    expect(bmr('M', 30, 178, 80, { bodyFatPct: 15, bfMeasured: true })).not.toBe(mifflin)
    expect(bmr('M', 30, 178, 80, { bodyFatPct: 15, bfMeasured: false })).toBe(mifflin)
  })
  it('training adds to the lifestyle factor (no double count)', () => {
    expect(effectiveActivityFactor('moderate', 0, 'moderate')).toBeCloseTo(1.45)
    expect(effectiveActivityFactor('moderate', 4, 'hard')).toBeCloseTo(1.45 + 4 * 0.025)
    expect(effectiveActivityFactor('high', 7, 'brutal')).toBeLessThanOrEqual(1.95) // capped
  })
  it('maintenance lands in a sane range', () => {
    const m = estimateMaintenance('M', 30, 178, 80, 'moderate', 4, 'moderate')
    expect(m).toBeGreaterThan(2400)
    expect(m).toBeLessThan(2900)
  })
})

describe('recommendApproach (decision table)', () => {
  const base: ApproachInput = { sex: 'M', goal: 'lose', followUp: 'lose_muscle_some', lifts: true, bodyFatPct: 18, experience: 'experienced' }

  it('lose + keep muscle high + lifts + novice/higher bf -> RECOMP', () => {
    expect(recommendApproach({ ...base, followUp: 'lose_muscle_high', experience: 'beginner' }).approach).toBe('RECOMP')
    expect(recommendApproach({ ...base, followUp: 'lose_muscle_high', bodyFatPct: 26 }).approach).toBe('RECOMP')
  })
  it('lose + keep muscle high + lifts + lean experienced -> CUT_HP', () => {
    expect(recommendApproach({ ...base, followUp: 'lose_muscle_high', bodyFatPct: 12 }).approach).toBe('CUT_HP')
  })
  it('lose + wants muscle + does NOT lift -> CUT_HP + lift invite', () => {
    const rec = recommendApproach({ ...base, followUp: 'lose_muscle_high', lifts: false })
    expect(rec.approach).toBe('CUT_HP')
    expect(rec.liftInvite).toBe(true)
  })
  it('lose + just the scale -> plain CUT', () => {
    expect(recommendApproach({ ...base, followUp: 'lose_scale_only' }).approach).toBe('CUT')
  })
  it('gain lean + lifts + lean -> LEAN_BULK; high bf -> RECOMP override', () => {
    expect(recommendApproach({ ...base, goal: 'gain', followUp: 'gain_lean', bodyFatPct: 12 }).approach).toBe('LEAN_BULK')
    expect(recommendApproach({ ...base, goal: 'gain', followUp: 'gain_lean', bodyFatPct: 26 }).approach).toBe('RECOMP')
  })
  it('gain faster + lifts + lean -> FAST_BULK', () => {
    expect(recommendApproach({ ...base, goal: 'gain', followUp: 'gain_faster', bodyFatPct: 12 }).approach).toBe('FAST_BULK')
  })
  it('gain + does NOT lift -> no surplus prescribed (lift invite)', () => {
    const rec = recommendApproach({ ...base, goal: 'gain', followUp: 'gain_lean', lifts: false })
    expect(rec.approach).toBe('RECOMP_MAINTAIN')
    expect(rec.liftInvite).toBe(true)
  })
  it('maintain + build + lifts -> RECOMP; hold -> MAINTAIN', () => {
    expect(recommendApproach({ ...base, goal: 'maintain', followUp: 'maintain_build' }).approach).toBe('RECOMP')
    expect(recommendApproach({ ...base, goal: 'maintain', followUp: 'maintain_hold' }).approach).toBe('MAINTAIN')
  })
  it('very high body fat + gain never gets a surplus', () => {
    const rec = recommendApproach({ ...base, goal: 'gain', followUp: 'gain_faster', bodyFatPct: 33 })
    expect(rec.approach).not.toBe('FAST_BULK')
  })
})

describe('computeMacros', () => {
  const base: MacroInput = {
    sex: 'M', age: 30, heightCm: 178, weightKg: 80,
    lifestyle: 'moderate', trainingDaysPerWeek: 4, intensity: 'moderate',
    approach: 'MAINTAIN', rate: 0,
  }

  it('kcal always equals the macro sum', () => {
    const p = computeMacros({ ...base, approach: 'CUT', rate: 0.007 })
    for (const d of [p.base, p.training, p.rest]) {
      expect(d.kcal).toBe(d.protein * 4 + d.carbs * 4 + d.fat * 9)
    }
  })

  it('maintenance matches BMR x the combined activity factor', () => {
    const p = computeMacros(base)
    expect(p.maintenance).toBe(Math.round(bmr('M', 30, 178, 80) * effectiveActivityFactor('moderate', 4, 'moderate')))
  })

  it('CUT respects the safety floor (no crash deficit)', () => {
    const p = computeMacros({ ...base, approach: 'CUT', rate: 0.01, weightKg: 55, heightCm: 160 })
    const floor = Math.max(Math.round(bmr('M', 30, 160, 55) * 1.1), 1500)
    expect(p.base.kcal).toBeGreaterThanOrEqual(floor)
  })

  it('LEAN_BULK surplus capped (<= +350 over maintenance)', () => {
    const p = computeMacros({ ...base, approach: 'LEAN_BULK', rate: 0.05 })
    expect(p.base.kcal - p.maintenance).toBeLessThanOrEqual(360) // 350 cap + macro rounding drift
    expect(p.base.kcal).toBeGreaterThan(p.maintenance)
  })

  it('CUT_HP keys protein to FFM when a body fat % exists', () => {
    const p = computeMacros({ ...base, approach: 'CUT_HP', rate: 0.007, bodyFatPct: 20 })
    expect(p.base.protein).toBe(165) // 2.6 * (80*0.8) = 166.4 -> 165
  })

  it('non-lifter maintenance uses a lower protein floor', () => {
    const sloucher = computeMacros({ ...base, approach: 'MAINTAIN', trainingDaysPerWeek: 0 })
    expect(sloucher.base.protein).toBe(145) // 1.8 * 80
  })

  it('fat respects the ~0.6 g/kg floor', () => {
    const p = computeMacros({ ...base, approach: 'CUT', rate: 0.01 })
    expect(p.base.fat).toBeGreaterThanOrEqual(Math.round(0.6 * 80) - 1)
  })

  it('training days carry more carbs; the week still averages to goal', () => {
    const p = computeMacros({ ...base, approach: 'RECOMP', trainingDaysPerWeek: 4 })
    expect(p.training.carbs).toBeGreaterThan(p.rest.carbs)
    expect(p.training.protein).toBe(p.rest.protein)
    expect(p.training.fat).toBe(p.rest.fat)
    const weekly = (4 * p.training.kcal + 3 * p.rest.kcal) / 7
    expect(Math.abs(weekly - p.base.kcal)).toBeLessThan(0.02 * p.base.kcal)
  })

  it('no cycle when not lifting, or training every day', () => {
    const none = computeMacros({ ...base, trainingDaysPerWeek: 0 })
    expect(none.training.kcal).toBe(none.rest.kcal)
    const everyday = computeMacros({ ...base, trainingDaysPerWeek: 7 })
    expect(everyday.training.kcal).toBe(everyday.rest.kcal)
  })

  it('honors a maintenance override (the adaptive seam)', () => {
    const p = computeMacros({ ...base, approach: 'CUT', rate: 0.007, maintenanceOverride: 3000 })
    expect(p.maintenance).toBe(3000)
    expect(p.base.kcal).toBeLessThan(3000)
  })
})

describe('defaultRate', () => {
  it('aggressive cut faster than gentle; bulk rates smaller; maintain 0', () => {
    expect(defaultRate('CUT', 'aggressive')).toBeGreaterThan(defaultRate('CUT', 'gentle'))
    expect(defaultRate('LEAN_BULK', 'standard')).toBeLessThan(defaultRate('CUT', 'standard'))
    expect(defaultRate('MAINTAIN', 'standard')).toBe(0)
  })
})

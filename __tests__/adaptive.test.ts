/**
 * Tests for the adaptive engine (lib/nutrition/adaptive.ts) — the pure brain
 * that learns maintenance from logged weight + food and judges the weekly trend
 * against a goal lane. kg-canonical; no IO. Run with:
 *   npx jest adaptive --testPathIgnorePatterns "/node_modules/"
 */

import {
  computeTrendRate,
  estimateMaintenance,
  goalBandFor,
  suggestTarget,
  evaluateCheckin,
  resplitForCycle,
  type WeighIn,
} from '@/lib/nutrition/adaptive'
import type { DayTarget } from '@/lib/nutrition/types'

// Build a daily weigh-in series starting at `start`, `days` long, drifting
// `kgPerDay` per day off `startKg`, with optional sinusoidal noise to mimic
// morning water/food swings the smoother must reject.
function series(start: string, days: number, startKg: number, kgPerDay: number, noise = 0): WeighIn[] {
  const [y, m, d] = start.split('-').map(Number)
  const out: WeighIn[] = []
  for (let i = 0; i < days; i++) {
    const dt = new Date(y, m - 1, d + i)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const wobble = noise * Math.sin(i * 1.7)
    out.push({ date: key, weightKg: startKg + kgPerDay * i + wobble })
  }
  return out
}

// matching daily kcal series for the same date span as `series`
function kcalSeries(start: string, days: number, kcal: number): { dayKey: string; kcal: number }[] {
  const [y, m, d] = start.split('-').map(Number)
  const out: { dayKey: string; kcal: number }[] = []
  for (let i = 0; i < days; i++) {
    const dt = new Date(y, m - 1, d + i)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    out.push({ dayKey: key, kcal })
  }
  return out
}

const LB = 0.453592

describe('computeTrendRate', () => {
  it('returns null rate for an empty or single-point series', () => {
    expect(computeTrendRate([]).rateKgPerWeek).toBeNull()
    expect(computeTrendRate([{ date: '2026-06-01', weightKg: 80 }]).rateKgPerWeek).toBeNull()
  })

  it('recovers a clean downward trend as a negative weekly rate', () => {
    // 28 days losing 0.1 kg/day == -0.7 kg/week
    const { rateKgPerWeek } = computeTrendRate(series('2026-05-10', 28, 82, -0.1))
    expect(rateKgPerWeek).not.toBeNull()
    expect(rateKgPerWeek!).toBeCloseTo(-0.7, 1)
  })

  it('rejects daily noise and still reads the underlying trend', () => {
    // same -0.7 kg/wk trend but with +-1.2kg morning noise on top
    const { rateKgPerWeek } = computeTrendRate(series('2026-05-10', 28, 82, -0.1, 1.2))
    expect(rateKgPerWeek!).toBeCloseTo(-0.7, 0) // within ~0.5 kg/wk of truth despite noise
  })

  it('exposes a smoothed series one point per weigh-in', () => {
    const { smoothed } = computeTrendRate(series('2026-05-10', 10, 80, 0))
    expect(smoothed).toHaveLength(10)
    // flat input -> flat 7-day average at 80
    expect(smoothed[smoothed.length - 1].avgKg).toBeCloseTo(80, 5)
  })
})

describe('estimateMaintenance', () => {
  it('recovers maintenance from energy balance', () => {
    // 28 days, eat 2000/day, lose 0.1 kg/day. Per-day deficit = 0.1*7700 = 770.
    // maintenance = intake - (weightChangeKcal/days) = 2000 - (-770) = 2770.
    const w = series('2026-05-10', 28, 82, -0.1)
    const k = kcalSeries('2026-05-10', 28, 2000)
    const { maintenanceKcal } = estimateMaintenance(w, k, 28)
    expect(maintenanceKcal).not.toBeNull()
    // ~100 kcal tolerance: a 7-day MA ramps up over its first week, slightly
    // flattening the fitted slope vs the ideal -0.7 kg/wk. Fine for a figure
    // shown softly and re-corrected weekly.
    expect(Math.abs(maintenanceKcal! - 2770)).toBeLessThan(100)
  })

  it('returns null + zero confidence when no meals are logged', () => {
    const w = series('2026-05-10', 28, 82, -0.1)
    const res = estimateMaintenance(w, [], 28)
    expect(res.maintenanceKcal).toBeNull()
    expect(res.confidence).toBe(0)
  })

  it('reports a positive logScaleGap when the user under-logs (scale rises faster than the log predicts)', () => {
    // Log says 1800/day with a reference maintenance of 2500 -> log predicts a
    // 700/day deficit (losing). But the scale GAINS 0.05 kg/day (+385/day). The
    // gap (actual - predicted) is strongly positive: the under-logging tell.
    const w = series('2026-05-10', 28, 80, +0.05)
    const k = kcalSeries('2026-05-10', 28, 1800)
    const { logScaleGap } = estimateMaintenance(w, k, 28, { referenceMaintenanceKcal: 2500 })
    expect(logScaleGap).not.toBeNull()
    expect(logScaleGap!).toBeGreaterThan(400)
  })

  it('leaves logScaleGap null when no reference maintenance is supplied', () => {
    const w = series('2026-05-10', 28, 80, +0.05)
    const k = kcalSeries('2026-05-10', 28, 1800)
    expect(estimateMaintenance(w, k, 28).logScaleGap).toBeNull()
  })
})

describe('goalBandFor', () => {
  it('maps cut outcomes to the -1.0..-0.5 lb/wk lane (in kg)', () => {
    const b = goalBandFor('CUT')
    expect(b.lowKgPerWeek).toBeCloseTo(-1.0 * LB, 4)
    expect(b.highKgPerWeek).toBeCloseTo(-0.5 * LB, 4)
    expect(goalBandFor('CUT_HP')).toEqual(b)
  })

  it('maps LEAN_BULK to +0.25..+0.5 lb/wk and FAST_BULK to +0.5..+1.0', () => {
    expect(goalBandFor('LEAN_BULK').lowKgPerWeek).toBeCloseTo(0.25 * LB, 4)
    expect(goalBandFor('LEAN_BULK').highKgPerWeek).toBeCloseTo(0.5 * LB, 4)
    expect(goalBandFor('FAST_BULK').lowKgPerWeek).toBeCloseTo(0.5 * LB, 4)
    expect(goalBandFor('FAST_BULK').highKgPerWeek).toBeCloseTo(1.0 * LB, 4)
  })

  it('maps maintain-like outcomes to the +-0.1 lb/wk lane', () => {
    for (const o of ['MAINTAIN', 'RECOMP', 'RECOMP_MAINTAIN', 'anything-unknown']) {
      expect(goalBandFor(o).lowKgPerWeek).toBeCloseTo(-0.1 * LB, 4)
      expect(goalBandFor(o).highKgPerWeek).toBeCloseTo(0.1 * LB, 4)
    }
  })

  it('prefers a persisted band over the outcome backfill', () => {
    const persisted = { lowKgPerWeek: -0.3, highKgPerWeek: -0.1 }
    expect(goalBandFor('CUT', persisted)).toEqual(persisted)
  })
})

describe('suggestTarget', () => {
  it('aims for the midpoint of the band', () => {
    // lean bulk midpoint = 0.375 lb/wk = 0.170 kg/wk -> +0.170*7700/7 ~= +187/day
    const t = suggestTarget(2500, goalBandFor('LEAN_BULK'))
    expect(t.targetKcal).toBeCloseTo(2500 + (0.375 * LB * 7700) / 7, -1)
  })
})

describe('evaluateCheckin — calibrating gate', () => {
  it('returns calibrating with a day countdown when there is too little data', () => {
    const w = series('2026-06-01', 5, 80, -0.05) // only 5 weigh-ins, ~5 day span
    const k = kcalSeries('2026-06-01', 5, 2000)
    const c = evaluateCheckin({ weighIns: w, dailyKcal: k, band: goalBandFor('CUT'), currentTargetKcal: 2200 })
    expect(c.status).toBe('calibrating')
    expect(c.suggestedKcal).toBeNull()
    expect(c.maintenanceKcal).toBeNull()
    expect(c.daysUntilFirstRead).toBeGreaterThan(0)
    expect(c.reason).not.toMatch(/[—–]/) // no em/en dashes in copy
  })
})

describe('evaluateCheckin — direction from the scale', () => {
  const band = goalBandFor('CUT') // lane ~ -0.45 .. -0.23 kg/wk

  it('on_track when the trend sits inside the lane', () => {
    const w = series('2026-05-01', 35, 82, -0.05) // ~ -0.35 kg/wk, inside cut lane
    const k = kcalSeries('2026-05-01', 35, 2000)
    const c = evaluateCheckin({ weighIns: w, dailyKcal: k, band, currentTargetKcal: 2000 })
    expect(c.status).toBe('on_track')
    expect(c.deltaKcal).toBe(0)
    expect(c.suggestedKcal).toBe(2000)
  })

  it('too_fast (eat more) when losing faster than the cut lane allows', () => {
    const w = series('2026-05-01', 35, 82, -0.2) // ~ -1.4 kg/wk, far below lane
    const k = kcalSeries('2026-05-01', 35, 1700)
    const c = evaluateCheckin({ weighIns: w, dailyKcal: k, band, currentTargetKcal: 1700 })
    expect(c.status).toBe('too_fast')
    expect(c.deltaKcal!).toBeGreaterThan(0) // nudge calories UP to ease the loss
    expect(c.suggestedKcal!).toBeGreaterThan(1700)
  })

  it('too_slow (eat less) when not losing fast enough on a cut', () => {
    const w = series('2026-05-01', 35, 82, -0.01) // ~ -0.07 kg/wk, above the lane
    const k = kcalSeries('2026-05-01', 35, 2300)
    const c = evaluateCheckin({ weighIns: w, dailyKcal: k, band, currentTargetKcal: 2300 })
    expect(c.status).toBe('too_slow')
    expect(c.deltaKcal!).toBeLessThan(0) // nudge calories DOWN
  })
})

describe('evaluateCheckin — integrity (the bad/under-tracker)', () => {
  it('steers the same direction regardless of a constant logging bias', () => {
    const w = series('2026-05-01', 35, 82, -0.2) // scale: losing fast -> too_fast
    const band = goalBandFor('CUT')
    const honest = evaluateCheckin({ weighIns: w, dailyKcal: kcalSeries('2026-05-01', 35, 2000), band, currentTargetKcal: 2000 })
    const underlogged = evaluateCheckin({ weighIns: w, dailyKcal: kcalSeries('2026-05-01', 35, 1400), band, currentTargetKcal: 2000 })
    expect(honest.status).toBe('too_fast')
    expect(underlogged.status).toBe('too_fast') // direction is scale-driven, not log-driven
  })

  it('sizes the nudge from the current target, so the same bias yields the same suggestion', () => {
    const w = series('2026-05-01', 35, 82, -0.2)
    const band = goalBandFor('CUT')
    const a = evaluateCheckin({ weighIns: w, dailyKcal: kcalSeries('2026-05-01', 35, 2000), band, currentTargetKcal: 2000 })
    const b = evaluateCheckin({ weighIns: w, dailyKcal: kcalSeries('2026-05-01', 35, 1400), band, currentTargetKcal: 2000 })
    // suggestion depends on trend + current target, not on the logged average
    expect(a.suggestedKcal).toBe(b.suggestedKcal)
  })

  it('clamps a single weekly step to <= 250 kcal (nudges, never lurches)', () => {
    const w = series('2026-05-01', 35, 82, -0.5) // absurdly fast loss
    const c = evaluateCheckin({ weighIns: w, dailyKcal: kcalSeries('2026-05-01', 35, 1500), band: goalBandFor('CUT'), currentTargetKcal: 1500 })
    expect(Math.abs(c.deltaKcal!)).toBeLessThanOrEqual(250)
  })

  it('names a large log/scale gap kindly, never as lying', () => {
    // gaining on the scale while logging a deep deficit
    const w = series('2026-05-01', 35, 80, +0.06)
    const k = kcalSeries('2026-05-01', 35, 1600)
    const c = evaluateCheckin(
      { weighIns: w, dailyKcal: k, band: goalBandFor('LEAN_BULK'), currentTargetKcal: 1600 },
      { referenceMaintenanceKcal: 2500 },
    )
    expect(c.logScaleGap!).toBeGreaterThan(150)
    expect(c.reason.toLowerCase()).toContain('scale')
    expect(c.reason.toLowerCase()).not.toContain('lying')
    expect(c.reason).not.toMatch(/[—–]/)
  })
})

describe('resplitForCycle', () => {
  const training: DayTarget = { kcal: 3020, protein: 135, carbs: 449, fat: 76 }
  const rest: DayTarget = { kcal: 2320, protein: 135, carbs: 274, fat: 76 }
  const trainingDaysPerWeek = 4 // weekly avg = (4*3020 + 3*2320)/7 = 2720

  it('shifts both days to hit the new weekly average, preserving the gap', () => {
    const out = resplitForCycle({ training, rest, trainingDaysPerWeek }, 2620) // -100/day avg
    const newAvg = (4 * out.training.kcal + 3 * out.rest.kcal) / 7
    expect(newAvg).toBeCloseTo(2620, 0)
    // gap unchanged: both dropped by the same per-day delta
    expect(out.training.kcal - out.rest.kcal).toBe(training.kcal - rest.kcal)
  })

  it('holds protein + fat and absorbs the kcal change into carbs', () => {
    const out = resplitForCycle({ training, rest, trainingDaysPerWeek }, 2620)
    expect(out.training.protein).toBe(135)
    expect(out.training.fat).toBe(76)
    expect(out.rest.protein).toBe(135)
    // training dropped 100 kcal -> ~25 g carbs
    expect(out.training.carbs).toBe(training.carbs - 25)
  })

  it('never returns negative carbs or kcal on a large cut', () => {
    const out = resplitForCycle({ training, rest, trainingDaysPerWeek }, 100)
    expect(out.training.carbs).toBeGreaterThanOrEqual(0)
    expect(out.rest.kcal).toBeGreaterThanOrEqual(0)
  })
})

import { readWorkout, type WorkoutReadRow } from '@/app/app/peak/workoutRead'
import { shiftDateKey } from '@/app/app/peak/loadRecentWorkouts'

// ── fixtures ──────────────────────────────────────────────────────────
const set = (weight: number | null, reps: number | null, done = true) => ({
  weight, reps, done, failed: false,
})
const ex = (id: string, sets: ReturnType<typeof set>[], name = id) => ({ id, name, sets })
const row = (
  date: string,
  day_name: string,
  exercises: ReturnType<typeof ex>[],
  off_day: WorkoutReadRow['off_day'] = null,
): WorkoutReadRow => ({ date, day_name, exercises, off_day })

const TODAY = '2026-06-22'
const LAST_PUSH = '2026-06-19'

describe('readWorkout — empty / safety', () => {
  it('no session today → neutral, hadSession false, never throws', () => {
    const r = readWorkout([], TODAY)
    expect(r.hadSession).toBe(false)
    expect(r.verdict).toBe('steady')
  })

  it('garbage input → neutral, never throws', () => {
    // @ts-expect-error deliberately wrong shape
    const r = readWorkout(null, TODAY)
    expect(r.hadSession).toBe(false)
  })
})

describe('readWorkout — verdict buckets vs last same-type session', () => {
  const priorPush = row(LAST_PUSH, 'Push heavy', [ex('bench', [set(100, 10), set(100, 10), set(100, 10)])]) // vol 3000

  it('clearly more volume than usual → strong', () => {
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(120, 10), set(120, 10), set(120, 10)])]) // vol 3600
    const r = readWorkout([today, priorPush], TODAY)
    expect(r.totalVolume).toBe(3600)
    expect(r.comparedTo).toBe(3000)
    expect(r.verdict).toBe('strong')
  })

  it('about the same as usual → steady', () => {
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(100, 10), set(100, 10), set(100, 10)])]) // vol 3000
    const r = readWorkout([today, priorPush], TODAY)
    expect(r.verdict).toBe('steady')
  })

  it('clearly less volume, no PR → lighter', () => {
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(80, 10), set(80, 10), set(80, 10)])]) // vol 2400
    const r = readWorkout([today, priorPush], TODAY)
    expect(r.verdict).toBe('lighter')
  })
})

describe('readWorkout — new ground (week 1 / no prior same-type)', () => {
  it('no comparable history → steady, comparedTo null', () => {
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(100, 10), set(100, 10)])])
    const r = readWorkout([today], TODAY)
    expect(r.comparedTo).toBeNull()
    expect(r.verdict).toBe('steady')
  })
})

describe('readWorkout — partial log safety', () => {
  it('counts only the finished (done) sets', () => {
    const today = row(TODAY, 'Push heavy', [
      ex('bench', [set(100, 10), set(100, 10), set(100, 10)]),     // 3000 done
      ex('ohp', [set(50, 10), set(null, null, false)]),            // 500 done + 1 not done
    ])
    const r = readWorkout([today], TODAY)
    expect(r.totalVolume).toBe(3500)
    expect(r.hadSession).toBe(true)
  })
})

describe('readWorkout — deload', () => {
  it('off_day deload → deload even when volume is way down, never lighter', () => {
    const priorPush = row(LAST_PUSH, 'Push heavy', [ex('bench', [set(100, 10), set(100, 10), set(100, 10)])])
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(40, 10), set(40, 10)])], 'deload') // tiny vol
    const r = readWorkout([today, priorPush], TODAY)
    expect(r.verdict).toBe('deload')
  })
})

describe('readWorkout — main-lift PR overrides a volume dip', () => {
  it('heavier top set on the main lift → strong even when total volume is down', () => {
    // prior push: bench 3x100x10 (3000) + ohp 3x50x12 (1800) = 4800
    const prior = row('2026-06-19', 'Push heavy', [
      ex('bench', [set(100, 10), set(100, 10), set(100, 10)]),
      ex('ohp', [set(50, 12), set(50, 12), set(50, 12)]),
    ])
    // today push: bench 3x105x10 (PR! 105>100) + ohp 1x50x12 = 3150 + 600 = 3750 (down)
    const today = row('2026-06-22', 'Push heavy', [
      ex('bench', [set(105, 10), set(105, 10), set(105, 10)]),
      ex('ohp', [set(50, 12)]),
    ])
    const r = readWorkout([today, prior], '2026-06-22')
    expect(r.totalVolume).toBeLessThan(r.comparedTo as number) // volume dipped
    expect(r.mainLiftPR).toBe(true)
    expect(r.verdict).toBe('strong')
  })

  it('more reps at the same weight on the main lift counts as a PR', () => {
    const prior = row('2026-06-19', 'Push heavy', [ex('bench', [set(100, 8)])])
    const today = row('2026-06-22', 'Push heavy', [ex('bench', [set(100, 10)])])
    const r = readWorkout([today, prior], '2026-06-22')
    expect(r.mainLiftPR).toBe(true)
    expect(r.verdict).toBe('strong')
  })

  it('first time doing the main lift is not a PR (stays new-ground steady)', () => {
    const today = row('2026-06-22', 'Push heavy', [ex('bench', [set(100, 10)])])
    const r = readWorkout([today], '2026-06-22')
    expect(r.mainLiftPR).toBe(false)
    expect(r.verdict).toBe('steady')
  })
})

describe('shiftDateKey', () => {
  it('shifts back across a month boundary', () => {
    expect(shiftDateKey('2026-06-01', -28)).toBe('2026-05-04')
  })
  it('shifts back within a month', () => {
    expect(shiftDateKey('2026-06-22', -28)).toBe('2026-05-25')
  })
})

describe('readWorkout — review hardening', () => {
  it('skips a bodyweight-only (zero-volume) same-type prior; uses recent average instead', () => {
    const bwPrior = row('2026-06-18', 'Push heavy', [ex('pushup', [set(null, 20), set(null, 20)])]) // vol 0
    const legs = row('2026-06-17', 'Legs', [ex('squat', [set(100, 10), set(100, 10)])]) // 2000
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(120, 10), set(120, 10)])]) // 2400
    const r = readWorkout([today, bwPrior, legs], TODAY)
    expect(r.comparedTo).toBe(2000) // fell back to the weighted average, never "vs 0"
    expect(r.verdict).toBe('strong') // 2400 / 2000 = 1.2
  })

  it('bodyweight-only prior with no other history → new ground (comparedTo null)', () => {
    const bwPrior = row('2026-06-18', 'Push heavy', [ex('pushup', [set(null, 20)])])
    const today = row(TODAY, 'Push heavy', [ex('bench', [set(100, 10), set(100, 10)])])
    const r = readWorkout([today, bwPrior], TODAY)
    expect(r.comparedTo).toBeNull()
    expect(r.verdict).toBe('steady')
  })

  it('ignores non-finite and non-positive weights in volume', () => {
    const today = row(TODAY, 'Push heavy', [
      ex('bench', [set(NaN, 10), set(-50, 10), set(100, 10)]), // only the last is valid → 1000
    ])
    const r = readWorkout([today], TODAY)
    expect(Number.isFinite(r.totalVolume)).toBe(true)
    expect(r.totalVolume).toBe(1000)
  })
})

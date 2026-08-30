/**
 * Tests for the vitals goal engine (lib/vitals/goals.ts). Pure, deterministic.
 * Run with: npx jest vitalsGoals --testPathIgnorePatterns "/node_modules/"
 */
import { deriveVitalsGoal, deriveVitalsGoalForMetric, evaluateGoalProgress, recalibrateGoal, LIMITER_TO_METRIC, type VitalsGoal } from '@/lib/vitals/goals'
import { computeHealthContext, type ProfileInput } from '@/lib/vitals/healthContext'
import type { VitalsReading } from '@/lib/vitals/advice'
import type { VitalsPreferences } from '@/lib/preferences'

const reading = (date: string, over: Partial<VitalsReading> = {}): VitalsReading => ({
  date, recovery: 60, hrv: 55, rhr: 55, sleep_perf: 85, sleep_hours: 7, strain: 10, ...over,
})
const profile: ProfileInput = { birthday: '2006-01-01', sex: 'M', heightCm: 180, weightKg: 80 }
const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`)
const quiz = (over: Partial<VitalsPreferences> = {}): VitalsPreferences => ({
  v: 1, sleepConsistency: 'steady', caffeineCutoff: 'morning', biggestLimiter: 'energy',
  healthFlags: [], completed_at: '2026-06-08T00:00:00Z', ...over,
})
const ctxFor = (readings: VitalsReading[], over: Partial<ProfileInput> = {}, flags: VitalsPreferences['healthFlags'] = []) =>
  computeHealthContext({ profile: { ...profile, ...over }, readings, flags, today: '2026-06-08' })

describe('LIMITER_TO_METRIC', () => {
  it('maps each limiter to a metric', () => {
    expect(LIMITER_TO_METRIC.sleep).toBe('sleep')
    expect(LIMITER_TO_METRIC.energy).toBe('recovery')
    expect(LIMITER_TO_METRIC.soreness).toBe('recovery')
    expect(LIMITER_TO_METRIC.stress).toBe('hrv')
    expect(LIMITER_TO_METRIC.plateau).toBe('strain')
    expect(LIMITER_TO_METRIC.optimize).toBe('recovery')
  })
})

describe('deriveVitalsGoal', () => {
  it('energy limiter + trusted mid baseline → reachable up target on recovery', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { recovery: 55 })))
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctx)
    expect(goal.metric).toBe('recovery')
    expect(goal.direction).toBe('up')
    expect(goal.baselineValue).toBe(55)
    expect(goal.targetValue).toBe(63) // 55 + clamp(35*0.4*1, 2, 8)=8
    expect(goal.isProvisional).toBe(false) // trusted
    expect(goal.confidence).toBe('trusted')
    expect(goal.windowDays).toBe(28)
  })

  it('already-strong baseline → hold, target is a personal floor', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { recovery: 80 })))
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctx)
    expect(goal.direction).toBe('hold')
    expect(goal.targetValue).toBe(74) // max(67, round(80*0.92)=74)
  })

  it('no data yet → provisional goal off the seed, low confidence', () => {
    const ctx = ctxFor([])
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctx)
    expect(goal.isProvisional).toBe(true)
    expect(goal.confidence).toBe('low')
    expect(goal.baselineValue).toBeNull()
    expect(goal.targetValue).toBeGreaterThan(55) // climbs from the seed
  })

  it('older + flagged user gets a gentler target and a longer window', () => {
    const young = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctxFor(dates(7).map(d => reading(d, { recovery: 55 }))))
    const old = deriveVitalsGoal(
      quiz({ biggestLimiter: 'energy' }),
      ctxFor(dates(7).map(d => reading(d, { recovery: 55 })), { birthday: '1956-01-01' }, ['condition']),
    )
    expect(old.targetValue).toBeLessThan(young.targetValue)
    expect(old.windowDays).toBe(35) // pace < 0.8 stretches the window
  })

  it('hrv goal climbs by a percentage of the personal baseline', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { hrv: 50 }))) // age 20: strongAt 65, so 50 is below → up
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'stress' }), ctx)
    expect(goal.metric).toBe('hrv')
    expect(goal.direction).toBe('up')
    expect(goal.targetValue).toBe(55) // 50 + clamp(50*0.10, 50*0.04, 50*0.12)=5
  })

  it('falls back to an available metric when the mapped one is unreported', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { hrv: null }))) // no HRV
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'stress' }), ctx) // stress→hrv, unavailable
    expect(goal.metric).not.toBe('hrv')
    expect(ctx.availableMetrics).toContain(goal.metric)
  })

  it('never throws with a null quiz', () => {
    expect(() => deriveVitalsGoal(null, ctxFor([]))).not.toThrow()
  })
})

const upGoal: VitalsGoal = {
  metric: 'recovery', direction: 'up', baselineValue: 55, targetValue: 65,
  windowDays: 28, confidence: 'trusted', isProvisional: false, sourceLimiter: 'energy',
}

describe('evaluateGoalProgress', () => {
  it('reports fractional progress between baseline and target', () => {
    const week = dates(7).map(d => reading(d, { recovery: 60 })) // halfway 55→65
    const p = evaluateGoalProgress(upGoal, week)
    expect(p.currentAvg).toBe(60)
    expect(p.pct).toBeCloseTo(0.5, 5)
    expect(p.ready).toBe(true)
    expect(p.achieved).toBe(false)
  })

  it('achieves only when the last 3 readings all hit target', () => {
    const week = [
      reading('2026-06-02', { recovery: 60 }), reading('2026-06-03', { recovery: 62 }),
      reading('2026-06-04', { recovery: 64 }), reading('2026-06-05', { recovery: 63 }),
      reading('2026-06-06', { recovery: 66 }), reading('2026-06-07', { recovery: 68 }),
      reading('2026-06-08', { recovery: 70 }),
    ]
    expect(evaluateGoalProgress(upGoal, week).achieved).toBe(true)
  })

  it('does NOT achieve on a single lucky day', () => {
    const week = [
      reading('2026-06-06', { recovery: 50 }), reading('2026-06-07', { recovery: 52 }),
      reading('2026-06-08', { recovery: 90 }), // one spike
    ]
    expect(evaluateGoalProgress(upGoal, week).achieved).toBe(false)
  })

  it('a provisional goal is never marked achieved', () => {
    const prov: VitalsGoal = { ...upGoal, isProvisional: true, confidence: 'building' }
    const week = dates(7).map(d => reading(d, { recovery: 80 }))
    const p = evaluateGoalProgress(prov, week)
    expect(p.ready).toBe(false)
    expect(p.achieved).toBe(false)
  })

  it('handles an empty week without throwing', () => {
    const p = evaluateGoalProgress(upGoal, [])
    expect(p.currentAvg).toBeNull()
    expect(p.pct).toBe(0)
    expect(p.achieved).toBe(false)
  })
})

describe('recalibrateGoal', () => {
  it('locks in (no longer provisional) once data is trusted', () => {
    const provisional = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctxFor([])) // low conf
    expect(provisional.isProvisional).toBe(true)
    const trustedCtx = ctxFor(dates(7).map(d => reading(d, { recovery: 58 })))
    const sharp = recalibrateGoal(provisional, trustedCtx)
    expect(sharp.isProvisional).toBe(false)
    expect(sharp.confidence).toBe('trusted')
    expect(sharp.baselineValue).toBe(58)
  })

  it('an up target only ever eases, never gets harder', () => {
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctxFor(dates(7).map(d => reading(d, { recovery: 55 })))) // target 63
    // later data shows a lower baseline → a fresh derive would aim lower; recalibrate must not raise the bar
    const lowerCtx = ctxFor(dates(7).map(d => reading(d, { recovery: 48 })))
    const re = recalibrateGoal(goal, lowerCtx)
    expect(re.targetValue).toBeLessThanOrEqual(goal.targetValue)
  })

  it('keeps the same metric it was created with', () => {
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'stress' }), ctxFor(dates(7).map(d => reading(d, { hrv: 50 }))))
    const re = recalibrateGoal(goal, ctxFor(dates(7).map(d => reading(d, { hrv: 52 }))))
    expect(re.metric).toBe('hrv')
  })

  it('never throws', () => {
    const goal = deriveVitalsGoal(quiz(), ctxFor([]))
    expect(() => recalibrateGoal(goal, ctxFor([]))).not.toThrow()
  })
})

describe('robustness matrix (never breaks, always a sane goal)', () => {
  const cases: Array<[string, () => ReturnType<typeof computeHealthContext>]> = [
    ['no wearable at all', () => ctxFor([])],
    ['connected, no sync today', () => ctxFor([])],
    ['device with no HRV', () => ctxFor(dates(7).map(d => reading(d, { hrv: null })))],
    ['missing height/weight', () => ctxFor(dates(7).map(d => reading(d)), { heightCm: null, weightKg: null })],
    ['missing age + sex', () => ctxFor(dates(7).map(d => reading(d)), { birthday: null, sex: null })],
    ['single anomalous spike', () => ctxFor([reading('2026-06-08', { recovery: 99 })])],
    ['implausible birthday', () => ctxFor(dates(7).map(d => reading(d)), { birthday: '1700-01-01' })],
    ['all readings null metrics', () => ctxFor(dates(7).map(d => reading(d, { recovery: null, hrv: null, sleep_hours: null, strain: null })))],
  ]

  it.each(cases)('%s → valid goal, no throw', (_label, makeCtx) => {
    const ctx = makeCtx()
    const goal = deriveVitalsGoal(quiz(), ctx)
    expect(['recovery', 'sleep', 'hrv', 'strain']).toContain(goal.metric)
    expect(Number.isFinite(goal.targetValue)).toBe(true)
    expect(goal.targetValue).toBeGreaterThan(0)
    expect(() => evaluateGoalProgress(goal, [])).not.toThrow()
    expect(() => recalibrateGoal(goal, ctx)).not.toThrow()
  })

  it('handles a HealthContext whose available metric is only sleep', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { recovery: null, hrv: null, strain: null })))
    const goal = deriveVitalsGoal(quiz({ biggestLimiter: 'energy' }), ctx)
    expect(goal.metric).toBe('sleep')
  })
})

describe('deriveVitalsGoalForMetric', () => {
  it('forces the chosen metric regardless of limiter', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { sleep_hours: 6 })))
    const goal = deriveVitalsGoalForMetric('sleep', quiz({ biggestLimiter: 'energy' }), ctx)
    expect(goal.metric).toBe('sleep')
  })
  it('falls back if the forced metric is unavailable', () => {
    const ctx = ctxFor(dates(7).map(d => reading(d, { hrv: null })))
    const goal = deriveVitalsGoalForMetric('hrv', quiz(), ctx)
    expect(goal.metric).not.toBe('hrv')
  })
})

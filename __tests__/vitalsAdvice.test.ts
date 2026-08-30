/**
 * Tests for the Vitals advice engine (lib/vitals/advice.ts) — the pure brain
 * that turns a WHOOP reading + 7-day trend + setup-quiz answers into a warm,
 * personal hero narrative. Deterministic, no IO. Run with:
 *   npx jest vitalsAdvice --testPathIgnorePatterns "/node_modules/"
 */

import { buildVitalsAdvice, recoveryBand, type VitalsReading } from '@/lib/vitals/advice'
import type { VitalsPreferences } from '@/lib/preferences'

const reading = (date: string, recovery: number | null, over: Partial<VitalsReading> = {}): VitalsReading => ({
  date, recovery, hrv: 60, rhr: 55, sleep_perf: 88, sleep_hours: 7.5, strain: 10, ...over,
})

const quiz = (over: Partial<VitalsPreferences> = {}): VitalsPreferences => ({
  v: 1, sleepConsistency: 'steady', caffeineCutoff: 'morning', biggestLimiter: 'sleep',
  healthFlags: [], completed_at: '2026-06-08T00:00:00Z', ...over,
})

// build a chronological week ending today, all at `rec`
const weekAt = (dates: string[], rec: number): VitalsReading[] => dates.map(d => reading(d, rec))
const DAYS = ['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08']

describe('recoveryBand', () => {
  it('bands by WHOOP thresholds', () => {
    expect(recoveryBand(80)).toBe('high')
    expect(recoveryBand(67)).toBe('high')
    expect(recoveryBand(50)).toBe('moderate')
    expect(recoveryBand(34)).toBe('moderate')
    expect(recoveryBand(20)).toBe('low')
    expect(recoveryBand(null)).toBe('unknown')
  })
})

describe('buildVitalsAdvice', () => {
  it('high recovery + sleep focus + good sleep gives a push line', () => {
    const latest = reading('2026-06-08', 80, { sleep_perf: 90 })
    const a = buildVitalsAdvice(latest, [latest], quiz({ biggestLimiter: 'sleep' }))
    expect(a.band).toBe('high')
    expect(a.pill).toBe('recovered')
    expect(a.headline).toContain('push')
  })

  it('low recovery is framed warmly, never as failure', () => {
    const latest = reading('2026-06-08', 22)
    const a = buildVitalsAdvice(latest, [latest], quiz({ biggestLimiter: 'energy' }))
    expect(a.band).toBe('low')
    expect(a.pill).toBe('take it easy')
    // no scolding words
    expect(a.headline.toLowerCase()).not.toMatch(/fail|bad|lazy|should have/)
  })

  it('compares today to the 7-day average in the sub line', () => {
    const week = weekAt(DAYS.slice(0, 6), 50) // prior 6 days avg 50
    const latest = reading('2026-06-08', 80)
    const a = buildVitalsAdvice(latest, [...week, latest], quiz())
    expect(a.sub).toContain('higher than your 7-day average of 50')
  })

  it('fires a grace nudge after 3 low days in a row', () => {
    const week = DAYS.map(d => reading(d, 25)) // every day low, incl today
    const a = buildVitalsAdvice(week[week.length - 1], week, quiz())
    expect(a.insights.some(i => i.includes('row'))).toBe(true)
  })

  it('flags late caffeine when sleep is plausibly paying for it', () => {
    const latest = reading('2026-06-08', 50, { sleep_perf: 74 })
    const a = buildVitalsAdvice(latest, [latest], quiz({ caffeineCutoff: 'late' }))
    expect(a.insights.some(i => i.includes('caffeine'))).toBe(true)
  })

  it('does not flag caffeine on a high day with good sleep', () => {
    const latest = reading('2026-06-08', 80, { sleep_perf: 92 })
    const a = buildVitalsAdvice(latest, [latest], quiz({ caffeineCutoff: 'late' }))
    expect(a.insights.some(i => i.includes('caffeine'))).toBe(false)
  })

  it('softens the read when a cycle is tracked', () => {
    const latest = reading('2026-06-08', 40)
    const a = buildVitalsAdvice(latest, [latest], quiz({ healthFlags: ['cycle'] }))
    expect(a.insights.some(i => i.includes('cycle'))).toBe(true)
  })

  it('caps insights at 2', () => {
    const week = DAYS.map(d => reading(d, 25, { sleep_perf: 70 }))
    const a = buildVitalsAdvice(week[week.length - 1], week,
      quiz({ caffeineCutoff: 'late', sleepConsistency: 'irregular', healthFlags: ['cycle'] }))
    expect(a.insights.length).toBeLessThanOrEqual(2)
  })

  it('handles a null-recovery reading without throwing', () => {
    const latest = reading('2026-06-08', null)
    const a = buildVitalsAdvice(latest, [latest], null)
    expect(a.band).toBe('unknown')
    expect(a.headline).toBeTruthy()
  })
})

import type { VitalsGoal } from '@/lib/vitals/goals'

describe('buildVitalsAdvice — goal awareness', () => {
  const upGoal: VitalsGoal = {
    metric: 'recovery', direction: 'up', baselineValue: 55, targetValue: 65,
    windowDays: 28, confidence: 'trusted', isProvisional: false, sourceLimiter: 'energy',
  }

  it('is backward compatible when no goal is passed', () => {
    const latest = reading('2026-06-08', 60)
    const a = buildVitalsAdvice(latest, [latest], quiz())
    expect(a.insights.length).toBeLessThanOrEqual(2)
  })

  it('leads with a goal-tied insight when a goal is passed', () => {
    const week = weekAt(DAYS, 60) // avg 60, climbing toward 65
    const a = buildVitalsAdvice(reading('2026-06-08', 60), week, quiz({ biggestLimiter: 'energy' }), upGoal)
    expect(a.insights[0]).toMatch(/recover|goal|target|toward|climb/i)
    expect(a.insights.length).toBeLessThanOrEqual(2)
  })

  it('a provisional goal speaks softly (getting to know your normal)', () => {
    const prov: VitalsGoal = { ...upGoal, isProvisional: true, confidence: 'building' }
    const a = buildVitalsAdvice(reading('2026-06-08', 60), weekAt(DAYS, 60), quiz(), prov)
    expect(a.insights[0].toLowerCase()).toMatch(/getting to know|learning|settling/)
  })
})

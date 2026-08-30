/**
 * Tests for the vitals health-context engine (lib/vitals/healthContext.ts).
 * Pure, deterministic, no IO. Run with:
 *   npx jest vitalsHealthContext --testPathIgnorePatterns "/node_modules/"
 */
import { clamp, mean, ageFromBirthday, expectedHrv } from '@/lib/vitals/healthContext'

describe('clamp', () => {
  it('bounds a number to [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('mean', () => {
  it('averages a non-empty list', () => {
    expect(mean([2, 4, 6])).toBe(4)
  })
  it('returns null for an empty list', () => {
    expect(mean([])).toBeNull()
  })
})

describe('ageFromBirthday', () => {
  it('computes whole years, accounting for month/day', () => {
    expect(ageFromBirthday('2006-01-01', '2026-06-08')).toBe(20)
    expect(ageFromBirthday('2006-12-31', '2026-06-08')).toBe(19) // birthday not yet reached
  })
  it('returns null on missing or implausible input', () => {
    expect(ageFromBirthday(null, '2026-06-08')).toBeNull()
    expect(ageFromBirthday('1700-01-01', '2026-06-08')).toBeNull()
  })
})

describe('expectedHrv', () => {
  it('declines with age via the soft-prior table', () => {
    expect(expectedHrv(20)).toBe(65)
    expect(expectedHrv(30)).toBe(55)
    expect(expectedHrv(50)).toBe(36)
    expect(expectedHrv(85)).toBe(25)
  })
  it('falls back to a mid value when age is unknown', () => {
    expect(expectedHrv(null)).toBe(45)
  })
})

import { computeHealthContext } from '@/lib/vitals/healthContext'
import type { VitalsReading } from '@/lib/vitals/advice'

const reading = (date: string, over: Partial<VitalsReading> = {}): VitalsReading => ({
  date, recovery: 60, hrv: 55, rhr: 55, sleep_perf: 85, sleep_hours: 7, strain: 10, ...over,
})
const profile = { birthday: '2006-01-01', sex: 'M' as const, heightCm: 180, weightKg: 80 }
const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`)

describe('computeHealthContext', () => {
  it('confidence scales with days of data', () => {
    const low = computeHealthContext({ profile, readings: dates(2).map(d => reading(d)), flags: [], today: '2026-06-08' })
    const building = computeHealthContext({ profile, readings: dates(4).map(d => reading(d)), flags: [], today: '2026-06-08' })
    const trusted = computeHealthContext({ profile, readings: dates(7).map(d => reading(d)), flags: [], today: '2026-06-08' })
    expect(low.confidence).toBe('low')
    expect(building.confidence).toBe('building')
    expect(trusted.confidence).toBe('trusted')
  })

  it('with no readings: all metrics available, baselines null, low confidence', () => {
    const ctx = computeHealthContext({ profile, readings: [], flags: [], today: '2026-06-08' })
    expect(ctx.confidence).toBe('low')
    expect(ctx.daysOfData).toBe(0)
    expect(ctx.availableMetrics.sort()).toEqual(['hrv', 'recovery', 'sleep', 'strain'])
    expect(ctx.perMetric.recovery.baseline).toBeNull()
    expect(ctx.perMetric.recovery.ceiling).toBe(90)
  })

  it('availableMetrics excludes a metric the device never reports', () => {
    const ctx = computeHealthContext({
      profile, today: '2026-06-08', flags: [],
      readings: dates(7).map(d => reading(d, { hrv: null })), // device with no HRV
    })
    expect(ctx.availableMetrics).not.toContain('hrv')
    expect(ctx.availableMetrics).toContain('recovery')
  })

  it('computes baseline + band from the person own data', () => {
    const ctx = computeHealthContext({
      profile, today: '2026-06-08', flags: [],
      readings: dates(7).map(d => reading(d, { recovery: 75 })), // already strong
    })
    expect(ctx.perMetric.recovery.baseline).toBe(75)
    expect(ctx.perMetric.recovery.band).toBe('strong')
  })

  it('hrv ceiling is age-derived', () => {
    const young = computeHealthContext({ profile, readings: [], flags: [], today: '2026-06-08' }) // age 20
    const old = computeHealthContext({ profile: { ...profile, birthday: '1956-01-01' }, readings: [], flags: [], today: '2026-06-08' }) // age 70
    expect(young.perMetric.hrv.strongAt).toBe(65)
    expect(old.perMetric.hrv.strongAt).toBe(25)
  })

  it('paceFactor is gentler for older + flagged + low-confidence users', () => {
    const young = computeHealthContext({ profile, readings: dates(7).map(d => reading(d)), flags: [], today: '2026-06-08' })
    const old = computeHealthContext({
      profile: { ...profile, birthday: '1956-01-01' }, // age 70
      readings: dates(1).map(d => reading(d)), // low confidence
      flags: ['condition'], today: '2026-06-08',
    })
    expect(young.paceFactor).toBe(1)
    expect(old.paceFactor).toBe(0.6) // floored
    expect(old.paceFactor).toBeLessThan(young.paceFactor)
  })

  it('never throws on fully empty / null inputs', () => {
    expect(() =>
      computeHealthContext({
        profile: { birthday: null, sex: null, heightCm: null, weightKg: null },
        readings: [], flags: [], today: '2026-06-08',
      }),
    ).not.toThrow()
  })
})

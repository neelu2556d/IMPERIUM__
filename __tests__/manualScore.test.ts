import {
  deriveManualMetrics,
  deriveSleepPerf,
  deriveRecovery,
  deriveStrain,
  sleepHoursFromSession,
  type ManualScoreInput,
} from '@/lib/vitals/manualScore'

const base: ManualScoreInput = {
  sleepHours: null,
  sleepQuality: null,
  feel: null,
  hrv: null,
  rhr: null,
  exertion: null,
  hrvBaseline: null,
  rhrBaseline: null,
  sleepNeed: 8,
}

describe('deriveSleepPerf', () => {
  it('is null with no sleep signal', () => {
    expect(deriveSleepPerf({ ...base })).toBeNull()
  })

  it('hitting the need with great quality reads ~100', () => {
    expect(deriveSleepPerf({ ...base, sleepHours: 8, sleepQuality: 5 })).toBe(100)
  })

  it('scores on hours alone when quality is absent', () => {
    // 4h against an 8h need = 50% → 50
    expect(deriveSleepPerf({ ...base, sleepHours: 4 })).toBe(50)
  })

  it('caps over-sleeping at 100', () => {
    expect(deriveSleepPerf({ ...base, sleepHours: 12, sleepNeed: 8 })).toBe(100)
  })

  it('respects a custom sleep need', () => {
    // 7h against a 7h need = 100
    expect(deriveSleepPerf({ ...base, sleepHours: 7, sleepNeed: 7 })).toBe(100)
  })
})

describe('deriveStrain', () => {
  it('is null without an exertion tap', () => {
    expect(deriveStrain({ ...base })).toBeNull()
  })

  it('maps the 1–5 exertion scale across the 0–21 range', () => {
    expect(deriveStrain({ ...base, exertion: 1 })).toBe(0)
    expect(deriveStrain({ ...base, exertion: 3 })).toBe(10.5)
    expect(deriveStrain({ ...base, exertion: 5 })).toBe(21)
  })
})

describe('deriveRecovery', () => {
  it('is null when nothing recovery-related is present', () => {
    expect(deriveRecovery({ ...base }, null)).toBeNull()
  })

  it('first-day (no baseline) leans on sleep + feel only', () => {
    // sleepPerf 100 (w .25) + feel 100 (w .20); HRV/RHR drop out with no baseline
    const v = deriveRecovery({ ...base, feel: 5 }, 100)
    expect(v).toBe(100)
  })

  it('HRV above baseline lifts recovery; below baseline drags it', () => {
    const high = deriveRecovery({ ...base, hrv: 80, hrvBaseline: 50 }, 50)
    const low = deriveRecovery({ ...base, hrv: 30, hrvBaseline: 50 }, 50)
    expect(high).not.toBeNull()
    expect(low).not.toBeNull()
    expect((high as number)).toBeGreaterThan(low as number)
  })

  it('a missing signal re-normalises instead of zero-penalising', () => {
    // Only feel present → recovery equals the feel sub-score, not a diluted one.
    expect(deriveRecovery({ ...base, feel: 3 }, null)).toBe(50)
  })
})

describe('deriveManualMetrics', () => {
  it('returns an all-null trio for an empty report', () => {
    expect(deriveManualMetrics({ ...base })).toEqual({
      recovery: null,
      sleepPerf: null,
      strain: null,
    })
  })

  it('produces a full WHOOP-style trio from a complete check-in', () => {
    const m = deriveManualMetrics({
      sleepHours: 8,
      sleepQuality: 4,
      feel: 4,
      hrv: 55,
      rhr: 52,
      exertion: 3,
      hrvBaseline: 50,
      rhrBaseline: 55,
      sleepNeed: 8,
    })
    expect(m.recovery).toBeGreaterThan(0)
    expect(m.recovery).toBeLessThanOrEqual(100)
    expect(m.sleepPerf).toBeGreaterThan(0)
    expect(m.sleepPerf).toBeLessThanOrEqual(100)
    expect(m.strain).toBe(10.5)
  })
})

describe('sleepHoursFromSession', () => {
  const bed = Date.UTC(2026, 5, 20, 23, 0, 0) // 11:00 PM
  const wake = Date.UTC(2026, 5, 21, 7, 0, 0) // 7:00 AM (8h span)

  it('is null without both timestamps', () => {
    expect(sleepHoursFromSession(bed, null)).toBeNull()
    expect(sleepHoursFromSession(null, wake)).toBeNull()
  })

  it('subtracts the fall-asleep offset from the bed→wake span', () => {
    // 8h span − 10min offset (default) = 7.83h
    expect(sleepHoursFromSession(bed, wake)).toBe(7.8)
    // No offset → full 8h
    expect(sleepHoursFromSession(bed, wake, 0)).toBe(8)
  })

  it('is null when wake is not after bed', () => {
    expect(sleepHoursFromSession(wake, bed)).toBeNull()
  })

  it('caps a forgotten wake tap at 24h', () => {
    const wayLater = bed + 40 * 3600_000
    expect(sleepHoursFromSession(bed, wayLater, 0)).toBe(24)
  })
})

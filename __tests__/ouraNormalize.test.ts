import {
  normalizeOuraMetrics,
  type OuraReadiness,
  type OuraSleepSession,
  type OuraDailySleep,
} from '../lib/oura/normalize'

const readiness = (score: number | null = 78, rhr: number | null = 49): OuraReadiness => ({
  day: '2026-06-18',
  score,
  contributors: { resting_heart_rate: rhr, hrv_balance: 60 },
})

const nightSleep = (over: Partial<OuraSleepSession> = {}): OuraSleepSession => ({
  day: '2026-06-18',
  type: 'long_sleep',
  total_sleep_duration: 7.5 * 3600, // 7.5h in seconds
  efficiency: 91,
  average_hrv: 88,
  lowest_heart_rate: 47,
  ...over,
})

const dailySleep = (score: number | null = 84): OuraDailySleep => ({
  day: '2026-06-18',
  score,
})

describe('normalizeOuraMetrics', () => {
  it('passes a finalized night reading straight through', () => {
    const r = normalizeOuraMetrics(readiness(), nightSleep(), dailySleep())
    expect(r.recovery).toBe(78)
    expect(r.hrv).toBe(88)
    expect(r.rhr).toBe(47)
    expect(r.sleep_perf).toBe(91)
    expect(r.sleep_hours).toBe(7.5)
    expect(r.strain).toBeNull() // Oura has no strain
    expect(r.provisional).toBe(false)
  })

  it('drops a not-yet-scored readiness (the morning case) and flags provisional', () => {
    const r = normalizeOuraMetrics(readiness(null), nightSleep(), dailySleep())
    expect(r.recovery).toBeNull()
    expect(r.provisional).toBe(true)
    // a finalized night sleep on the same load is still trustworthy
    expect(r.hrv).toBe(88)
    expect(r.sleep_perf).toBe(91)
  })

  it('ignores a nap session (not long_sleep) for the night numbers', () => {
    const nap = nightSleep({ type: 'late_nap', average_hrv: 30, lowest_heart_rate: 70 })
    const r = normalizeOuraMetrics(readiness(), nap, dailySleep())
    // nap must not set the overnight metrics
    expect(r.hrv).toBeNull()
    expect(r.sleep_hours).toBeNull()
    // recovery from readiness still stands; rhr falls back to readiness contributor
    expect(r.recovery).toBe(78)
    expect(r.rhr).toBe(49)
  })

  it('falls back to the readiness RHR when the night sleep lacks one', () => {
    const r = normalizeOuraMetrics(readiness(78, 49), nightSleep({ lowest_heart_rate: null }), dailySleep())
    expect(r.rhr).toBe(49)
  })

  it('falls back to the daily_sleep score when the session has no efficiency', () => {
    const r = normalizeOuraMetrics(readiness(), nightSleep({ efficiency: null }), dailySleep(84))
    expect(r.sleep_perf).toBe(84)
  })

  it('treats a zero-duration session as no sleep', () => {
    const r = normalizeOuraMetrics(readiness(), nightSleep({ total_sleep_duration: 0 }), dailySleep())
    expect(r.sleep_hours).toBeNull()
    expect(r.hrv).toBeNull()
  })

  it('assumes an untyped session is the night sleep (older payloads omit type)', () => {
    const r = normalizeOuraMetrics(readiness(), nightSleep({ type: undefined }), dailySleep())
    expect(r.hrv).toBe(88)
    expect(r.sleep_hours).toBe(7.5)
  })

  it('degrades gracefully when Oura returns nothing', () => {
    const r = normalizeOuraMetrics(null, null, null)
    expect(r).toEqual({
      hrv: null, rhr: null, recovery: null,
      sleep_perf: null, sleep_hours: null, strain: null, provisional: false,
    })
  })
})

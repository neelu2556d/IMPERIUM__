import {
  normalizeWhoopMetrics,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopCycle,
} from '../lib/whoop/normalize'

const cycle = (id: number, score_state = 'SCORED'): WhoopCycle => ({
  id,
  start: '2026-06-18T06:00:00.000Z',
  end: null,
  timezone_offset: '-04:00',
  score_state,
  score: { strain: 11.1, average_heart_rate: 70 },
})

const recovery = (cycle_id: number, score_state = 'SCORED'): WhoopRecovery => ({
  cycle_id,
  sleep_id: 99,
  score_state,
  score: { user_calibrating: false, recovery_score: 61, resting_heart_rate: 48, hrv_rmssd_milli: 95 },
  created_at: '2026-06-18T11:00:00.000Z',
})

const sleep = (score_state = 'SCORED'): WhoopSleep => ({
  id: 99,
  start: '2026-06-17T23:00:00.000Z',
  end: '2026-06-18T07:00:00.000Z',
  timezone_offset: '-04:00',
  score_state,
  score: {
    sleep_performance_percentage: 84,
    stage_summary: { total_in_bed_time_milli: 8 * 3_600_000, total_awake_time_milli: 0.5 * 3_600_000 },
  },
})

describe('normalizeWhoopMetrics', () => {
  it('passes finalized, same-cycle readings straight through', () => {
    const r = normalizeWhoopMetrics(recovery(1), sleep(), cycle(1))
    expect(r.recovery).toBe(61)
    expect(r.hrv).toBe(95)
    expect(r.rhr).toBe(48)
    expect(r.sleep_perf).toBe(84)
    expect(r.sleep_hours).toBe(7.5)
    expect(r.strain).toBe(11.1)
    expect(r.provisional).toBe(false)
  })

  it('drops a PENDING_SCORE recovery (the morning bug) and flags provisional', () => {
    const r = normalizeWhoopMetrics(recovery(1, 'PENDING_SCORE'), sleep(), cycle(1))
    expect(r.recovery).toBeNull()
    expect(r.hrv).toBeNull()
    expect(r.rhr).toBeNull()
    expect(r.provisional).toBe(true)
    // a finalized sleep on the same load is still trustworthy
    expect(r.sleep_perf).toBe(84)
  })

  it("drops a recovery that belongs to a different (previous) cycle", () => {
    // /recovery?limit=1 still returns yesterday's cycle 1 while today is cycle 2
    const r = normalizeWhoopMetrics(recovery(1), sleep(), cycle(2))
    expect(r.recovery).toBeNull()
    expect(r.provisional).toBe(true)
  })

  it('drops a PENDING_SCORE sleep but keeps a finalized recovery', () => {
    const r = normalizeWhoopMetrics(recovery(1), sleep('PENDING_SCORE'), cycle(1))
    expect(r.sleep_perf).toBeNull()
    expect(r.sleep_hours).toBeNull()
    expect(r.recovery).toBe(61)
    expect(r.provisional).toBe(false)
  })

  it('drops strain from an unscored cycle', () => {
    const r = normalizeWhoopMetrics(recovery(1), sleep(), cycle(1, 'PENDING_SCORE'))
    expect(r.strain).toBeNull()
  })

  it('treats UNSCORABLE as not-final (null, not a wrong number)', () => {
    const r = normalizeWhoopMetrics(recovery(1, 'UNSCORABLE'), sleep('UNSCORABLE'), cycle(1))
    expect(r.recovery).toBeNull()
    expect(r.sleep_perf).toBeNull()
  })

  it('degrades gracefully when WHOOP returns nothing', () => {
    const r = normalizeWhoopMetrics(null, null, null)
    expect(r).toEqual({ hrv: null, rhr: null, recovery: null, sleep_perf: null, sleep_hours: null, strain: null, provisional: false })
  })
})

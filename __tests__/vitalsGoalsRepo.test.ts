/**
 * Tests for the pure vitals-goal DB mappers (lib/vitals/goalsRepo.ts).
 * No IO. Run with: npx jest vitalsGoalsRepo --testPathIgnorePatterns "/node_modules/"
 */
import { rowToGoal, goalToRow, profileRowToInput, latestWeightKg, coerceReading } from '@/lib/vitals/goalsRepo'
import type { VitalsGoal } from '@/lib/vitals/goals'

const goal: VitalsGoal = {
  metric: 'recovery', direction: 'up', baselineValue: 55, targetValue: 63,
  windowDays: 28, confidence: 'trusted', isProvisional: false, sourceLimiter: 'energy',
}

describe('rowToGoal', () => {
  it('maps a db row to a VitalsGoal, coercing numerics', () => {
    const g = rowToGoal({
      id: 'x', user_id: 'u', metric: 'recovery', direction: 'up',
      baseline_value: '55.00', target_value: '63.00', window_days: 28,
      confidence: 'trusted', is_provisional: false, status: 'active',
      source_limiter: 'energy', context_snapshot: null,
      created_at: '', baseline_set_at: null, recalibrated_at: null, achieved_at: null,
    })
    expect(g).toEqual(goal)
  })
  it('maps a null baseline through', () => {
    const g = rowToGoal({ ...baseRow(), baseline_value: null })
    expect(g.baselineValue).toBeNull()
  })
})

describe('goalToRow', () => {
  it('produces an insert payload with the user id + snapshot + provisional flags', () => {
    const row = goalToRow(goal, 'user-1', { foo: 1 })
    expect(row.user_id).toBe('user-1')
    expect(row.metric).toBe('recovery')
    expect(row.target_value).toBe(63)
    expect(row.is_provisional).toBe(false)
    expect(row.status).toBe('active')
    expect(row.context_snapshot).toEqual({ foo: 1 })
  })
})

describe('profileRowToInput', () => {
  it('prefers the latest weight, falls back to starting weight', () => {
    const withLatest = profileRowToInput(
      { birthday: '2006-01-01', sex: 'M', height_cm: '180.0', starting_weight_kg: '80.0' }, 76,
    )
    expect(withLatest).toEqual({ birthday: '2006-01-01', sex: 'M', heightCm: 180, weightKg: 76 })

    const noLatest = profileRowToInput(
      { birthday: '2006-01-01', sex: 'M', height_cm: '180.0', starting_weight_kg: '80.0' }, null,
    )
    expect(noLatest.weightKg).toBe(80)
  })
  it('tolerates a null profile row', () => {
    expect(profileRowToInput(null, null)).toEqual({ birthday: null, sex: null, heightCm: null, weightKg: null })
  })
})

describe('latestWeightKg', () => {
  it('picks the most recent weigh-in by date', () => {
    expect(latestWeightKg([
      { date: '2026-06-01', weight_kg: '80.0' },
      { date: '2026-06-07', weight_kg: '78.5' },
      { date: '2026-06-03', weight_kg: '79.0' },
    ])).toBe(78.5)
  })
  it('returns null for an empty list', () => {
    expect(latestWeightKg([])).toBeNull()
  })
})

describe('coerceReading', () => {
  it('coerces string numerics to numbers', () => {
    const r = coerceReading({ date: '2026-06-08', recovery: 60, hrv: '55.00', rhr: 50, sleep_perf: '85.5', sleep_hours: '7.20', strain: '12.30' })
    expect(r.hrv).toBe(55)
    expect(r.sleep_hours).toBe(7.2)
    expect(r.strain).toBe(12.3)
    expect(r.recovery).toBe(60)
  })
  it('keeps nulls', () => {
    const r = coerceReading({ date: 'd', recovery: null, hrv: null, rhr: null, sleep_perf: null, sleep_hours: null, strain: null })
    expect(r.hrv).toBeNull()
  })
})

function baseRow() {
  return {
    id: 'x', user_id: 'u', metric: 'recovery', direction: 'up',
    baseline_value: '55.00', target_value: '63.00', window_days: 28,
    confidence: 'trusted', is_provisional: false, status: 'active',
    source_limiter: 'energy', context_snapshot: null,
    created_at: '', baseline_set_at: null, recalibrated_at: null, achieved_at: null,
  }
}

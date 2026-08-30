import {
  computeVitalsScore,
  tierForScore,
  computeBaselines,
  computeScoreSeries,
  type ScoreInput,
} from '@/lib/vitals/score'

const base: ScoreInput = {
  recovery: null,
  sleepPerf: null,
  hrv: null,
  rhr: null,
  sleepHours: null,
  strain: null,
  hrvBaseline: null,
  rhrBaseline: null,
  sleepTarget: 8,
}

describe('tierForScore', () => {
  it('maps score ranges to the five tiers at the right boundaries', () => {
    expect(tierForScore(0)).toBe('needs-care')
    expect(tierForScore(39)).toBe('needs-care')
    expect(tierForScore(40)).toBe('low')
    expect(tierForScore(54)).toBe('low')
    expect(tierForScore(55)).toBe('steady')
    expect(tierForScore(69)).toBe('steady')
    expect(tierForScore(70)).toBe('strong')
    expect(tierForScore(84)).toBe('strong')
    expect(tierForScore(85)).toBe('peak')
    expect(tierForScore(100)).toBe('peak')
  })
})

describe('computeVitalsScore', () => {
  it('returns null when there is no data at all', () => {
    expect(computeVitalsScore({ ...base })).toBeNull()
  })

  it('scores recovery and sleep performance directly', () => {
    const r = computeVitalsScore({ ...base, recovery: 80, sleepPerf: 90 })!
    expect(r.subs.find(s => s.key === 'recovery')!.score).toBe(80)
    expect(r.subs.find(s => s.key === 'sleep_perf')!.score).toBe(90)
  })

  it('scores HRV at its baseline as 50, higher HRV above 50', () => {
    const atBase = computeVitalsScore({ ...base, hrv: 60, hrvBaseline: 60 })!
    const above = computeVitalsScore({ ...base, hrv: 75, hrvBaseline: 60 })!
    expect(atBase.subs.find(s => s.key === 'hrv')!.score).toBe(50)
    expect(above.subs.find(s => s.key === 'hrv')!.score!).toBeGreaterThan(50)
  })

  it('scores resting HR below baseline above 50 (lower is better)', () => {
    const lower = computeVitalsScore({ ...base, rhr: 50, rhrBaseline: 60 })!
    const higher = computeVitalsScore({ ...base, rhr: 70, rhrBaseline: 60 })!
    expect(lower.subs.find(s => s.key === 'rhr')!.score!).toBeGreaterThan(50)
    expect(higher.subs.find(s => s.key === 'rhr')!.score!).toBeLessThan(50)
  })

  it('scores sleep hours against the target', () => {
    const onTarget = computeVitalsScore({ ...base, sleepHours: 8, sleepTarget: 8 })!
    expect(onTarget.subs.find(s => s.key === 'sleep_hours')!.score).toBe(100)
    const half = computeVitalsScore({ ...base, sleepHours: 4, sleepTarget: 8 })!
    expect(half.subs.find(s => s.key === 'sleep_hours')!.score).toBe(50)
  })

  it('combines available sub-scores by weight, re-normalised over what is present', () => {
    // only recovery (60, w.30) + sleep_perf (80, w.20): (60*.3 + 80*.2)/(.3+.2) = 68
    const r = computeVitalsScore({ ...base, recovery: 60, sleepPerf: 80 })!
    expect(r.score).toBe(68)
    expect(r.confidence).toBeCloseTo(0.5, 5)
  })

  it('never zero-penalises a missing reading (re-balances)', () => {
    const r = computeVitalsScore({ ...base, recovery: 72 })!
    expect(r.score).toBe(72)
    expect(r.missing.length).toBeGreaterThan(0)
  })

  it('always lists six sub-scores whose weights sum to 1', () => {
    const r = computeVitalsScore({ ...base, recovery: 50 })!
    expect(r.subs).toHaveLength(6)
    expect(r.subs.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 5)
  })

  it('tags the overall score with its tier', () => {
    const r = computeVitalsScore({ ...base, recovery: 90 })!
    expect(r.tier).toBe('peak')
  })
})

describe('computeBaselines', () => {
  it('averages available hrv and rhr, ignoring nulls', () => {
    const rows = [
      { hrv: 60, rhr: 50 },
      { hrv: 70, rhr: null },
      { hrv: null, rhr: 60 },
    ] as never
    const b = computeBaselines(rows)
    expect(b.hrv).toBe(65)
    expect(b.rhr).toBe(55)
  })

  it('returns null baselines when there is no data', () => {
    expect(computeBaselines([]).hrv).toBeNull()
    expect(computeBaselines([]).rhr).toBeNull()
  })
})

describe('computeScoreSeries', () => {
  it('produces one score per day that has data and skips empty days', () => {
    const rows = [
      { date: '2026-06-16', recovery: 80, sleep_perf: null, hrv: null, rhr: null, sleep_hours: null, strain: null },
      { date: '2026-06-15', recovery: 60, sleep_perf: null, hrv: null, rhr: null, sleep_hours: null, strain: null },
      { date: '2026-06-14', recovery: null, sleep_perf: null, hrv: null, rhr: null, sleep_hours: null, strain: null },
    ] as never
    const series = computeScoreSeries(rows, { hrv: null, rhr: null }, 8)
    expect(series).toHaveLength(2)
    expect(series.map(p => p.date)).toEqual(['2026-06-16', '2026-06-15'])
    expect(series[0].score).toBe(80)
  })
})

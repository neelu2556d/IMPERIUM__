import { alignByBucket } from '@/lib/insights/align'

describe('alignByBucket — day bucket with lag (caffeine -> next-morning recovery)', () => {
  it('pairs caffeine day N with recovery day N+1 under lag:1, and drops days with no next-day reading', () => {
    const caffeine = [
      { key: '2026-06-01', value: 200 },
      { key: '2026-06-02', value: 80 },
      { key: '2026-06-05', value: 300 }, // no recovery on 06-06 -> must be dropped
    ]
    const recovery = [
      { key: '2026-06-02', value: 55 },
      { key: '2026-06-03', value: 70 },
    ]
    const pairs = alignByBucket(caffeine, recovery, { bucket: 'day', lag: 1, minPerBucket: 1 })
    expect(pairs).toEqual([
      [200, 55], // caffeine 06-01 -> recovery 06-02
      [80, 70],  // caffeine 06-02 -> recovery 06-03
    ])
  })

  it('with no lag, pairs the same day from both series', () => {
    const a = [{ key: '2026-06-01', value: 10 }, { key: '2026-06-02', value: 20 }]
    const b = [{ key: '2026-06-02', value: 5 }, { key: '2026-06-03', value: 6 }]
    expect(alignByBucket(a, b, { bucket: 'day' })).toEqual([[20, 5]])
  })

  it('returns no pairs when the two series never overlap', () => {
    const a = [{ key: '2026-06-01', value: 1 }]
    const b = [{ key: '2026-07-01', value: 2 }]
    expect(alignByBucket(a, b, { bucket: 'day', lag: 1 })).toEqual([])
  })
})

describe('alignByBucket — week bucket with per-series aggregation (sleep mean x training count)', () => {
  // Epoch weeks anchor on floor(epochDay/7) (Thu boundaries). Each triplet below
  // stays inside one bucket, and the two clusters are >7 days apart (distinct weeks).
  const sleep = [
    { key: '2026-06-01', value: 8 }, { key: '2026-06-02', value: 7 }, { key: '2026-06-03', value: 9 }, // wk1 mean 8
    { key: '2026-06-15', value: 6 }, { key: '2026-06-16', value: 6 }, { key: '2026-06-17', value: 6 }, // wk2 mean 6
  ]
  const sessions = [
    { key: '2026-06-01', value: 1 }, { key: '2026-06-02', value: 1 }, { key: '2026-06-03', value: 1 }, // wk1 sum 3
    { key: '2026-06-16', value: 1 }, // wk2 sum 1
  ]

  it('buckets each week and collapses sleep by mean, sessions by sum', () => {
    const pairs = alignByBucket(sleep, sessions, { bucket: 'week', minPerBucket: 1, aggA: 'mean', aggB: 'sum' })
    expect(pairs).toEqual([[8, 3], [6, 1]])
  })

  it('drops a week without enough raw points on either side (minPerBucket)', () => {
    // sleep wk2 has only 3 nights; require 4 -> wk2 dropped, only wk1 survives.
    const pairs = alignByBucket(sleep, sessions, { bucket: 'week', minPerBucket: 4, aggA: 'mean', aggB: 'sum' })
    expect(pairs).toEqual([])
  })
})

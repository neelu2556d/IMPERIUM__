import { toDailySeries } from '@/lib/insights/series'

describe('toDailySeries — Stage 1 adapter (raw logs -> one clean daily series)', () => {
  it('normalizes dated rows into a date-sorted series and carries its density', () => {
    const s = toDailySeries(
      [{ date: '2026-06-03', value: 70 }, { date: '2026-06-01', value: 55 }],
      { density: 'daily' },
    )
    expect(s.density).toBe('daily')
    expect(s.points).toEqual([
      { key: '2026-06-01', value: 55 },
      { key: '2026-06-03', value: 70 },
    ])
  })

  it('collapses same-day entries with the chosen aggregation (caffeine sums across the day)', () => {
    const s = toDailySeries(
      [{ date: '2026-06-01', value: 120 }, { date: '2026-06-01', value: 80 }],
      { density: 'daily', agg: 'sum' },
    )
    expect(s.points).toEqual([{ key: '2026-06-01', value: 200 }])
  })

  it('drops null, non-finite, and unparseable rows (never invents a point)', () => {
    const s = toDailySeries(
      [
        { date: '2026-06-01', value: 50 },
        { date: '2026-06-02', value: null },
        { date: '2026-06-03', value: Number.NaN },
        { date: 'not-a-date', value: 99 },
      ],
      { density: 'daily' },
    )
    expect(s.points).toEqual([{ key: '2026-06-01', value: 50 }])
  })

  it('accepts a Date and keys it by local day (no UTC drift)', () => {
    const s = toDailySeries([{ date: new Date(2026, 5, 1, 9, 30), value: 10 }], { density: 'daily' })
    expect(s.points).toEqual([{ key: '2026-06-01', value: 10 }])
  })

  it('carries a snapshot density through so the engine can refuse to fake a trend on it', () => {
    const s = toDailySeries([{ date: '2026-06-01', value: 100000 }], { density: 'snapshot' })
    expect(s.density).toBe('snapshot')
  })
})

import { reportsToSeries, seamForStream, tileInsight } from '@/lib/tiles/tileInsight'
import type { TileReportRow, ReportKind, GoalDirection } from '@/lib/tiles/reportContract'

const rows = (streamKey: string, byDate: Record<string, number>): TileReportRow[] =>
  Object.entries(byDate).map(([date, value]) => ({ streamKey, value, date }))

/** A run of `days` consecutive dates starting at 2026-06-01, each mapped to the
 *  value returned by `valueAt(i)`. Keeps the per-day series honest and dense. */
const daily = (days: number, valueAt: (i: number) => number): Record<string, number> => {
  const out: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const d = String(i + 1).padStart(2, '0')
    out[`2026-06-${d}`] = valueAt(i)
  }
  return out
}

const insight = (
  byDate: Record<string, number>,
  kind: ReportKind,
  goalDirection?: GoalDirection,
) => tileInsight({ rows: rows('s', byDate), kind, goalDirection })

describe('reportsToSeries: kind drives same-day aggregation', () => {
  test('intake sums same-day datapoints into one daily point', () => {
    const s = reportsToSeries(
      [
        { streamKey: 'beer', value: 2, date: '2026-06-01' },
        { streamKey: 'beer', value: 1, date: '2026-06-01' },
        { streamKey: 'beer', value: 4, date: '2026-06-02' },
      ],
      'intake',
    )
    expect(s.density).toBe('daily')
    expect(s.points).toEqual([
      { key: '2026-06-01', value: 3 },
      { key: '2026-06-02', value: 4 },
    ])
  })

  test('rating averages same-day datapoints', () => {
    const s = reportsToSeries(
      [
        { streamKey: 'mood', value: 4, date: '2026-06-01' },
        { streamKey: 'mood', value: 6, date: '2026-06-01' },
      ],
      'rating',
    )
    expect(s.points).toEqual([{ key: '2026-06-01', value: 5 }])
  })

  test('measure takes the last reading of the day', () => {
    const s = reportsToSeries(
      [
        { streamKey: 'weight', value: 80, date: '2026-06-01' },
        { streamKey: 'weight', value: 79.5, date: '2026-06-01' },
      ],
      'measure',
    )
    expect(s.points).toEqual([{ key: '2026-06-01', value: 79.5 }])
  })
})

describe('seamForStream: a reported stream becomes an honest Vee insight', () => {
  // Honest synthetic data: more beers today, lower recovery TOMORROW (lag 1).
  const beerByDay: Record<string, number> = {
    '2026-06-01': 0, '2026-06-02': 4, '2026-06-03': 0, '2026-06-04': 5, '2026-06-05': 1,
    '2026-06-06': 6, '2026-06-07': 0, '2026-06-08': 3, '2026-06-09': 5, '2026-06-10': 2,
  }
  // recovery[d+1] = 90 - 8 * beer[d]
  const recovery = [
    { key: '2026-06-02', value: 90 }, { key: '2026-06-03', value: 58 }, { key: '2026-06-04', value: 90 },
    { key: '2026-06-05', value: 50 }, { key: '2026-06-06', value: 82 }, { key: '2026-06-07', value: 42 },
    { key: '2026-06-08', value: 90 }, { key: '2026-06-09', value: 66 }, { key: '2026-06-10', value: 50 },
    { key: '2026-06-11', value: 74 },
  ]

  test('fires on a real beer -> next-day recovery drop (the magic clip)', () => {
    const seam = seamForStream(
      { rows: rows('beer', beerByDay), kind: 'intake', goalDirection: 'down', canonicalKey: 'alcohol' },
      { points: recovery, name: 'recovery' },
    )
    expect(seam).not.toBeNull()
    if (seam) {
      expect(seam.finding.direction).toBe('neg') // more beer, less recovery
      expect(seam.domains.sort()).toEqual(['alcohol', 'recovery'])
      expect(seam.n).toBeGreaterThanOrEqual(8)
      expect(Math.abs(seam.r)).toBeGreaterThan(0.7)
    }
  })

  test('stays SILENT when the stream has no real effect on recovery', () => {
    // recovery sits flat regardless of how many beers: no covariation to find.
    const flatRecovery = Object.keys(beerByDay).map((d, i) => ({
      key: `2026-06-${String(i + 2).padStart(2, '0')}`,
      value: 70,
    }))
    const seam = seamForStream(
      { rows: rows('beer', beerByDay), kind: 'intake', goalDirection: 'down', canonicalKey: 'alcohol' },
      { points: flatRecovery, name: 'recovery' },
    )
    expect(seam).toBeNull()
  })

  test('stays SILENT with too few logged days (not enough evidence)', () => {
    const seam = seamForStream(
      {
        rows: rows('beer', { '2026-06-01': 0, '2026-06-02': 5, '2026-06-03': 1 }),
        kind: 'intake',
        goalDirection: 'down',
        canonicalKey: 'alcohol',
      },
      { points: recovery, name: 'recovery' },
    )
    expect(seam).toBeNull()
  })
})

describe('tileInsight: sparse data gets honest, gentle copy (never a fake trend)', () => {
  test('0 datapoints: neutral, quiet, no invented number', () => {
    const i = insight({}, 'count')
    expect(i.kind).toBe('quiet')
    expect(i.tone).toBe('neutral')
    expect(i.stat).toBe(0)
    expect(i.text.toLowerCase()).toContain('nothing logged')
  })

  test('1 datapoint: gentle starting line, never a trend', () => {
    const i = insight({ '2026-06-01': 5 }, 'count')
    expect(i.kind).toBe('starting')
    expect(i.tone).not.toBe('caution')
    expect(i.stat).toBe(1)
    expect(i.text.toLowerCase()).toContain('one day')
  })

  test('2 datapoints: still starting, no trend claim', () => {
    const i = insight({ '2026-06-01': 5, '2026-06-02': 9 }, 'count')
    expect(i.kind).toBe('starting')
    expect(i.stat).toBe(2)
    expect(i.text.toLowerCase()).toContain('two days')
  })

  test('sparse data never divides by zero or emits NaN/Infinity', () => {
    const cases: Record<string, number>[] = [{}, { '2026-06-01': 0 }, { '2026-06-01': 0, '2026-06-02': 0 }]
    for (const byDate of cases) {
      const i = insight(byDate, 'intake', 'down')
      expect(Number.isFinite(i.stat)).toBe(true)
      expect(i.text).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
})

describe('tileInsight: streak copy is specific and grounded', () => {
  test('a run of active days reads as a streak with the real count', () => {
    // 5 straight training days (kind done): a 5 day streak.
    const i = insight(daily(5, () => 1), 'done', 'up')
    expect(i.kind).toBe('streak')
    expect(i.tone).toBe('good')
    expect(i.stat).toBe(5)
    expect(i.text).toContain('5 days in a row')
  })

  test("a 'down' goal counts CLEAN (zero) days as the streak", () => {
    // 4 zero-spend days in a row: a clean streak for a down goal.
    const i = insight(daily(4, () => 0), 'money', 'down')
    expect(i.kind).toBe('streak')
    expect(i.tone).toBe('good')
    expect(i.stat).toBe(4)
    expect(i.text).toContain('clean day')
  })

  test('a broken run does not report a streak', () => {
    // last logged day is a zero -> no active streak for an up-count stream.
    const byDate = { ...daily(4, () => 3), '2026-06-05': 0 }
    const i = insight(byDate, 'count', 'up')
    expect(i.kind).not.toBe('streak')
  })
})

describe('tileInsight: goalDirection sets the tone, never calls a bad move good', () => {
  const risingHalf = daily(8, (idx) => (idx < 4 ? 10 : 20)) // older ~10, recent ~20: up 100%

  test("rising on an 'up' goal is GOOD (azure-mint)", () => {
    const i = insight(risingHalf, 'count', 'up')
    expect(i.kind).toBe('trend')
    expect(i.tone).toBe('good')
    expect(i.stat).toBeGreaterThan(0)
    expect(i.text.toLowerCase()).toContain('right way')
  })

  test("the SAME rising trend on a 'down' goal is a CAUTION, never good, never red", () => {
    const i = insight(risingHalf, 'intake', 'down')
    expect(i.kind).toBe('trend')
    expect(i.tone).toBe('caution')
    // The wrong-way move is surfaced honestly, not dressed up as good.
    expect(i.text.toLowerCase()).not.toContain('right way')
  })

  test("falling on a 'down' goal is GOOD (less is the win)", () => {
    const fallingHalf = daily(8, (idx) => (idx < 4 ? 20 : 10)) // recent lower: good for down
    const i = insight(fallingHalf, 'money', 'down')
    expect(i.kind).toBe('trend')
    expect(i.tone).toBe('good')
    expect(i.stat).toBeLessThan(0) // fell
    expect(i.text.toLowerCase()).toContain('right way')
  })

  test("falling on an 'up' goal is a CAUTION", () => {
    const fallingHalf = daily(8, (idx) => (idx < 4 ? 20 : 10))
    const i = insight(fallingHalf, 'count', 'up')
    expect(i.kind).toBe('trend')
    expect(i.tone).toBe('caution')
  })

  test('a neutral rating trend is reported but not judged good or bad', () => {
    const risingRating = daily(8, (idx) => (idx < 4 ? 4 : 8))
    const i = insight(risingRating, 'rating') // no goalDirection: neutral
    expect(i.kind).toBe('trend')
    expect(i.tone).toBe('neutral')
  })
})

describe('tileInsight: consistency read on a steady window', () => {
  test('a tight recent window reads as steady, good tone', () => {
    // Values all right around 100 (spread well under 15% CV): steady.
    const steady = daily(8, (idx) => 100 + (idx % 2 === 0 ? 1 : -1))
    const i = insight(steady, 'measure')
    expect(i.kind).toBe('consistency')
    expect(i.tone).toBe('good')
    expect(i.text.toLowerCase()).toContain('steady')
  })
})

describe('tileInsight: color LAW and copy rules hold on every branch', () => {
  // A broad sweep of shapes across every kind + direction.
  const kinds: ReportKind[] = ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']
  const dirs: (GoalDirection | undefined)[] = ['up', 'down', 'neutral', undefined]
  const shapes: Record<string, number>[] = [
    {},
    { '2026-06-01': 3 },
    { '2026-06-01': 3, '2026-06-02': 4 },
    daily(6, () => 5), // flat run
    daily(8, (idx) => (idx < 4 ? 10 : 25)), // up
    daily(8, (idx) => (idx < 4 ? 25 : 10)), // down
    daily(5, () => 0), // all zero
    daily(5, () => 1), // all one
    daily(10, (idx) => (idx % 3 === 0 ? 0 : 4)), // choppy
  ]

  test('tone is only ever good | caution | neutral (NEVER red/danger)', () => {
    for (const kind of kinds) {
      for (const dir of dirs) {
        for (const shape of shapes) {
          const i = insight(shape, kind, dir)
          expect(['good', 'caution', 'neutral']).toContain(i.tone)
          // belt and braces: the string 'red' or 'danger' never leaks as a tone.
          expect(i.tone).not.toMatch(/red|danger|alert|error/)
        }
      }
    }
  })

  test('no em dash and no emoji anywhere in the copy', () => {
    // Match any emoji via surrogate-pair / symbol ranges, plus the em/en dashes.
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/u
    for (const kind of kinds) {
      for (const dir of dirs) {
        for (const shape of shapes) {
          const { text } = insight(shape, kind, dir)
          expect(text).not.toContain('—') // em dash
          expect(text).not.toContain('–') // en dash
          expect(text).not.toMatch(emoji)
        }
      }
    }
  })

  test('every line is non-empty and ends with a period', () => {
    for (const kind of kinds) {
      for (const dir of dirs) {
        for (const shape of shapes) {
          const { text } = insight(shape, kind, dir)
          expect(text.trim().length).toBeGreaterThan(0)
          expect(text.trim().endsWith('.')).toBe(true)
        }
      }
    }
  })

  test('deterministic: same input yields byte-identical output', () => {
    const shape = daily(8, (idx) => (idx < 4 ? 10 : 20))
    const a = insight(shape, 'count', 'up')
    const b = insight(shape, 'count', 'up')
    expect(a).toEqual(b)
  })
})

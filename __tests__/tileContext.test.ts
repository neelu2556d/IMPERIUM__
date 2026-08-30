import { buildTileContextLines } from '@/lib/tiles/tileContext'
import { getRecentDateKeys } from '@/lib/dates'
import type { TileStreamRow, TileReportRow } from '@/lib/tiles/reportContract'

const TODAY = '2026-07-02'
const KEYS = getRecentDateKeys(TODAY, 28) // index 0 = today

function def(over: Partial<TileStreamRow> = {}): TileStreamRow {
  return {
    key: 'beer',
    canonicalKey: 'alcohol',
    label: 'Beer',
    kind: 'intake',
    goalDirection: 'down',
    ...over,
  }
}

function rows(streamKey: string, byOffset: Record<number, number>): TileReportRow[] {
  return Object.entries(byOffset).map(([off, value]) => ({
    streamKey,
    value,
    date: KEYS[Number(off)],
  }))
}

describe('buildTileContextLines — per-kind formats', () => {
  it('intake: weekly total, active days, the user\'s usual pace, family + goal', () => {
    const lines = buildTileContextLines(
      [def()],
      rows('beer', { 1: 2, 3: 3, 6: 1, 10: 3, 17: 3 }),
      TODAY,
    )
    expect(lines).toEqual(['Beer (alcohol, goal: less): 6 this week over 3 days. Usual ~3/wk.'])
  })

  it('done: days-of-seven, no invented magnitude', () => {
    const lines = buildTileContextLines(
      [def({ key: 'meditate', canonicalKey: 'meditate', label: 'Meditate', kind: 'done', goalDirection: 'up' })],
      rows('meditate', { 0: 1, 2: 1, 5: 1 }),
      TODAY,
    )
    expect(lines).toEqual(['Meditate (goal: more): 3 of 7 days this week.'])
  })

  it('rating: the week\'s average of the felt score', () => {
    const lines = buildTileContextLines(
      [def({ key: 'stress', canonicalKey: 'stress', label: 'Stress', kind: 'rating', goalDirection: 'down' })],
      rows('stress', { 0: 7, 1: 6, 3: 8 }),
      TODAY,
    )
    expect(lines).toEqual(['Stress (goal: less): avg 7 across 3 days this week.'])
  })

  it('measure: last reading and its day, never judged', () => {
    const lines = buildTileContextLines(
      [def({ key: 'waist', canonicalKey: 'waist', label: 'Waist', kind: 'measure', goalDirection: null })],
      rows('waist', { 2: 84.4, 9: 85.1 }),
      TODAY,
    )
    expect(lines).toEqual([`Waist: last 84.4 on ${KEYS[2]}.`])
  })

  it('no parenthetical when the family adds nothing and no goal is stated', () => {
    const lines = buildTileContextLines(
      [def({ key: 'pages', canonicalKey: 'pages', label: 'Pages', kind: 'count', goalDirection: null })],
      rows('pages', { 1: 20, 4: 30 }),
      TODAY,
    )
    expect(lines[0]!.startsWith('Pages: ')).toBe(true)
  })
})

describe('buildTileContextLines — shape and discipline', () => {
  it('[] for a user with no streams', () => {
    expect(buildTileContextLines([], [], TODAY)).toEqual([])
  })

  it('a stream silent for 28 days is only counted, never expanded', () => {
    const lines = buildTileContextLines(
      [def(), def({ key: 'old', canonicalKey: 'old', label: 'Old tile' })],
      rows('beer', { 1: 2, 3: 2, 8: 2, 12: 2, 15: 2 }),
      TODAY,
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('and 1 quieter tile.')
  })

  it('most recently active first, alphabetical on same-day ties', () => {
    const streams = [
      def({ key: 'zeta', canonicalKey: 'zeta', label: 'Zeta', kind: 'count', goalDirection: null }),
      def({ key: 'alpha', canonicalKey: 'alpha', label: 'Alpha', kind: 'count', goalDirection: null }),
      def({ key: 'older', canonicalKey: 'older', label: 'Older', kind: 'count', goalDirection: null }),
    ]
    const reports = [
      ...rows('zeta', { 0: 1 }),
      ...rows('alpha', { 0: 1 }),
      ...rows('older', { 5: 1 }),
    ]
    const lines = buildTileContextLines(streams, reports, TODAY)
    expect(lines[0]!.startsWith('Alpha')).toBe(true)
    expect(lines[1]!.startsWith('Zeta')).toBe(true)
    expect(lines[2]!.startsWith('Older')).toBe(true)
  })

  it('caps at 8 lines and folds the rest into one honest closer', () => {
    const streams = Array.from({ length: 12 }, (_, i) =>
      def({ key: `s${i}`, canonicalKey: `s${i}`, label: `Stream ${i}`, kind: 'count', goalDirection: null }),
    )
    const reports = streams.flatMap((s) => rows(s.key, { [0]: 1 }))
    const lines = buildTileContextLines(streams, reports, TODAY)
    expect(lines).toHaveLength(9) // 8 streams + the closer
    expect(lines[8]).toBe('and 4 quieter tiles.')
  })

  it('stays inside a small token budget even fully loaded (15 streams)', () => {
    const streams = Array.from({ length: 15 }, (_, i) =>
      def({ key: `st${i}`, canonicalKey: `st${i}`, label: `Stream number ${i}`, kind: 'intake', goalDirection: 'down' }),
    )
    const reports = streams.flatMap((s) =>
      rows(s.key, { 0: 12.5, 2: 3, 5: 8, 11: 4, 20: 9 }),
    )
    const lines = buildTileContextLines(streams, reports, TODAY)
    const joined = lines.join('\n')
    // ~4 chars a token: keep the whole block under ~175 tokens worst case
    expect(joined.length).toBeLessThan(700)
    expect(lines.length).toBeLessThanOrEqual(9)
  })

  it('same-day duplicate rows collapse by the kind\'s aggregation before phrasing', () => {
    const lines = buildTileContextLines(
      [def()],
      [
        { streamKey: 'beer', value: 1, date: KEYS[1] },
        { streamKey: 'beer', value: 2, date: KEYS[1] },
      ],
      TODAY,
    )
    expect(lines[0]).toContain('3 this week over 1 days')
  })
})

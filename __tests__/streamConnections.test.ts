import {
  findStreamConnections,
  connectionToCandidate,
  connectionContextLines,
  type OutcomeDef,
  type StreamSeriesInput,
} from '@/lib/insights/streamConnections'
import type { TileStreamRow, TileReportRow } from '@/lib/tiles/reportContract'

// ---------------------------------------------------------------------------
// Fixtures — 14 alternating days in June 2026, fully deterministic.
// Beer alternates 0,4,0,4,...; each outcome reads off the PREVIOUS day's beer,
// so the true link lives at lag 1 (today's intake, tomorrow's body).
// ---------------------------------------------------------------------------

const day = (i: number): string => `2026-06-${String(i + 1).padStart(2, '0')}`
const BEER_VALS = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 0 : 4))

function beerStream(over: Partial<TileStreamRow> = {}): StreamSeriesInput {
  const def: TileStreamRow = {
    key: 'beer',
    canonicalKey: 'alcohol',
    label: 'Beer',
    kind: 'intake',
    goalDirection: 'down',
    ...over,
  }
  const rows: TileReportRow[] = BEER_VALS.map((v, i) => ({
    streamKey: def.key,
    value: v,
    date: day(i),
  }))
  return { def, rows }
}

/** An outcome on days 2..15 driven by the previous day's beer: base - slope*beer. */
function lagged(name: string, base: number, slope: number): OutcomeDef {
  return {
    name,
    label: name,
    points: BEER_VALS.map((v, i) => ({ key: day(i + 1), value: base - slope * v })),
  }
}

const RECOVERY = lagged('recovery', 80, 5) // 80 after clean days, 60 after big ones

describe('findStreamConnections — the pairwise scan', () => {
  it('finds the beer to next-morning recovery link with real receipts', () => {
    const [c, ...rest] = findStreamConnections([beerStream()], [RECOVERY])
    expect(rest).toHaveLength(0)
    expect(c.patternKey).toBe('alcohol+recovery')
    expect(c.lag).toBe(1)
    expect(c.finding.direction).toBe('neg')
    expect(c.finding.bHi).toBeCloseTo(60)
    expect(c.finding.bLo).toBeCloseTo(80)
    expect(c.score.n).toBe(14)
  })

  it('phrases the link warm, honest, and correlation-read only', () => {
    const [c] = findStreamConnections([beerStream()], [RECOVERY])
    expect(c.line).toBe(
      'Your heavier beer days tend to show up the next morning. Your recovery averaged 60 after your bigger days and 80 after your lighter ones.',
    )
    expect(c.line).toContain(c.highlight) // highlight is a verbatim substring
    expect(c.line).not.toMatch(/—|because|causes/) // no em dash, no causation
  })

  it('refuses a wrong-sign link instead of phrasing it (down habit, positive r)', () => {
    // A non-alternating pattern (so no mirror-image lag artifact) whose
    // "recovery" IMPROVES with beer, same day: r is +1, expectDir is neg, and
    // the lag-1 read is far too weak to clear the r gate. Silence, both lags.
    const P = [0, 4, 4, 0, 0, 4, 0, 0, 4, 4, 0, 4, 0, 0]
    const stream: StreamSeriesInput = {
      def: { key: 'beer', canonicalKey: 'alcohol', label: 'Beer', kind: 'intake', goalDirection: 'down' },
      rows: P.map((v, i) => ({ streamKey: 'beer', value: v, date: day(i) })),
    }
    const backwards: OutcomeDef = {
      name: 'recovery',
      label: 'recovery',
      points: P.map((v, i) => ({ key: day(i), value: 60 + 5 * v })),
    }
    expect(findStreamConnections([stream], [backwards])).toHaveLength(0)
  })

  it('stays silent under the paired-days gate', () => {
    const short: OutcomeDef = { ...RECOVERY, points: RECOVERY.points.slice(0, 6) }
    expect(findStreamConnections([beerStream()], [short])).toHaveLength(0)
  })

  it('stays silent on a flat outcome (no fake r from a constant series)', () => {
    const flat = lagged('recovery', 70, 0)
    expect(findStreamConnections([beerStream()], [flat])).toHaveLength(0)
  })

  it('stays silent when the link is real but too small to feel (contrast gate)', () => {
    const tiny = lagged('recovery', 80, 0.01) // r is perfect, the move is 0.04 points
    expect(findStreamConnections([beerStream()], [tiny])).toHaveLength(0)
  })

  it('keeps only each stream\'s single BEST outcome, never a wall', () => {
    const strong = lagged('recovery', 80, 10) // 80 vs 40, the bigger felt gap
    const weaker = lagged('sleep', 6, 0.5) // 6 vs 4, real but smaller strength
    const found = findStreamConnections([beerStream()], [weaker, strong])
    expect(found).toHaveLength(1)
    expect(found[0].outcome).toBe('recovery')
  })

  it('tries the other lag when the kind\'s default finds nothing (count, lag 1)', () => {
    // a count stream defaults to same-day, but this data only links at lag 1 —
    // and at lag 0 the alternating pattern reads POSITIVE, which the direction
    // gate refuses, so the scan must reach the honest lag-1 read.
    const coffees = beerStream({ key: 'coffees', canonicalKey: 'caffeine', label: 'Coffees', kind: 'count' })
    const [c] = findStreamConnections([coffees], [RECOVERY])
    expect(c).toBeDefined()
    expect(c.lag).toBe(1)
    expect(c.finding.direction).toBe('neg')
  })

  it('is deterministic: same inputs, same output, run twice', () => {
    const a = findStreamConnections([beerStream()], [RECOVERY])
    const b = findStreamConnections([beerStream()], [RECOVERY])
    expect(a).toEqual(b)
  })
})

describe('connectionToCandidate — plugs into the existing fusion slot', () => {
  it('carries the copy, a verbatim highlight, and two real receipts', () => {
    const [c] = findStreamConnections([beerStream()], [RECOVERY])
    const cand = connectionToCandidate(c)
    expect(cand.notice.why).toBe(c.line)
    expect(cand.notice.why).toContain(cand.notice.key)
    expect(cand.notice.receipts).toEqual([
      'bigger days: recovery 60',
      'lighter days: recovery 80',
    ])
    expect(cand.watched).toBe('beer + recovery')
    expect(cand.score.domains).toEqual(['alcohol', 'recovery'])
  })
})

describe('connectionContextLines — the chat whisper', () => {
  it('caps at two lines and cites the evidence', () => {
    const streams = [
      beerStream(),
      beerStream({ key: 'coffees', canonicalKey: 'caffeine', label: 'Coffees', kind: 'count' }),
      beerStream({ key: 'screen', canonicalKey: 'screen', label: 'Screen time', kind: 'duration' }),
    ]
    const found = findStreamConnections(streams, [RECOVERY])
    expect(found.length).toBe(3)
    const lines = connectionContextLines(found)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('paired days')
  })
})

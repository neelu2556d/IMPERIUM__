import {
  modeOf,
  baselineOf,
  scoreDay,
  scoreStream,
  combineStreamScores,
  buildStreamWindows,
  BASELINE_SCORE,
  type StreamWindow,
} from '@/lib/vitality/contributors/tileStreams'
import { getRecentDateKeys } from '@/lib/dates'
import type { TileStreamRow, TileReportRow } from '@/lib/tiles/reportContract'

const TODAY = '2026-07-02'
const KEYS = getRecentDateKeys(TODAY, 35) // index 0 = today

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

/** A window with values on the given day-offsets (0 = today). */
function win(d: TileStreamRow, byOffset: Record<number, number>): StreamWindow {
  const byDay = new Map<string, number>()
  for (const [off, v] of Object.entries(byOffset)) byDay.set(KEYS[Number(off)], v)
  return { def: d, byDay }
}

describe('modeOf — the kind x direction table', () => {
  it('magnitude when a judgeable kind has a stated direction', () => {
    expect(modeOf('intake', 'down')).toBe('magnitude')
    expect(modeOf('count', 'up')).toBe('magnitude')
    expect(modeOf('duration', 'up')).toBe('magnitude')
    expect(modeOf('money', 'down')).toBe('magnitude')
    expect(modeOf('rating', 'down')).toBe('magnitude')
  })
  it('cadence when no direction is stated (only the logging habit is judged)', () => {
    expect(modeOf('intake', null)).toBe('cadence')
    expect(modeOf('count', 'neutral')).toBe('cadence')
    expect(modeOf('duration', undefined)).toBe('cadence')
  })
  it('done and measure are ALWAYS cadence, even with a direction', () => {
    expect(modeOf('done', 'up')).toBe('cadence')
    expect(modeOf('measure', 'down')).toBe('cadence')
    expect(modeOf('measure', null)).toBe('cadence')
  })
})

describe('baselineOf — the user\'s own trailing median', () => {
  it('odd count takes the middle value', () => {
    const byDay = new Map([[KEYS[1], 2], [KEYS[3], 8], [KEYS[5], 4]])
    expect(baselineOf(byDay, KEYS.slice(0, 28))).toEqual({ b: 4, reportDays: 3 })
  })
  it('even count averages the middle two', () => {
    const byDay = new Map([[KEYS[1], 2], [KEYS[2], 4], [KEYS[3], 6], [KEYS[4], 12]])
    expect(baselineOf(byDay, KEYS.slice(0, 28))).toEqual({ b: 5, reportDays: 4 })
  })
  it('one wild day cannot move the median the way it would a mean', () => {
    const byDay = new Map([[KEYS[1], 3], [KEYS[2], 3], [KEYS[3], 3], [KEYS[4], 3], [KEYS[5], 100]])
    expect(baselineOf(byDay, KEYS.slice(0, 28))?.b).toBe(3)
  })
  it('null when the window holds no reports', () => {
    expect(baselineOf(new Map(), KEYS.slice(0, 28))).toBeNull()
  })
  it('ignores reports outside the window keys', () => {
    const byDay = new Map([[KEYS[30], 9]])
    expect(baselineOf(byDay, KEYS.slice(0, 28))).toBeNull()
  })
})

describe('scoreDay — magnitude vs your own baseline', () => {
  it('up: hitting your usual is 1.0, half is 0.5, more is capped at 1.0', () => {
    expect(scoreDay(6, 6, 'up')).toBe(1)
    expect(scoreDay(3, 6, 'up')).toBe(0.5)
    expect(scoreDay(12, 6, 'up')).toBe(1)
  })
  it('up: b=0 edge — only a logged something scores', () => {
    expect(scoreDay(2, 0, 'up')).toBe(1)
    expect(scoreDay(0, 0, 'up')).toBe(0)
  })
  it('down: a clean day is a perfect day', () => {
    expect(scoreDay(0, 4, 'down')).toBe(1)
  })
  it('down: your usual amount lands at BASELINE_SCORE, never zero', () => {
    expect(scoreDay(4, 4, 'down')).toBeCloseTo(BASELINE_SCORE)
  })
  it('down: half your usual sits between clean and usual', () => {
    expect(scoreDay(2, 4, 'down')).toBeCloseTo(1 - (1 - BASELINE_SCORE) / 2) // 0.825
  })
  it('down: double your usual is 0, and past that stays clamped at 0', () => {
    expect(scoreDay(8, 4, 'down')).toBe(0)
    expect(scoreDay(20, 4, 'down')).toBe(0)
  })
  it('down: b=0 edge — any amount is a gentle miss, a clean day still perfect', () => {
    expect(scoreDay(3, 0, 'down')).toBeCloseTo(1 - BASELINE_SCORE)
    expect(scoreDay(0, 0, 'down')).toBe(1)
  })
})

describe('scoreStream — eligibility gates', () => {
  it('not established (4 report days in 28) is silently excluded', () => {
    const w = win(def(), { 1: 2, 3: 2, 8: 2, 12: 2 })
    expect(scoreStream(w, KEYS)).toBeNull()
  })
  it('established at 5 report days scores', () => {
    const w = win(def(), { 1: 2, 3: 2, 8: 2, 12: 2, 15: 2 })
    expect(scoreStream(w, KEYS)).not.toBeNull()
  })
  it('dormant (active in the 28 but silent all week) is excluded — drift\'s job', () => {
    const w = win(def(), { 8: 2, 10: 2, 12: 2, 15: 2, 20: 2 })
    expect(scoreStream(w, KEYS)).toBeNull()
  })
  it('a day-one stream never tanks the orb', () => {
    const w = win(def(), { 0: 5 })
    expect(scoreStream(w, KEYS)).toBeNull()
  })
})

describe('scoreStream — magnitude (the beer case, direction down)', () => {
  it('an engaged logger\'s missing days count as clean days', () => {
    // usual is 2 beers; logged twice this week, five silent (clean) days
    const w = win(def(), { 1: 2, 4: 2, 9: 2, 12: 2, 16: 2 })
    const s = scoreStream(w, KEYS)
    expect(s?.mode).toBe('magnitude')
    // week: day1 + day4 at usual (0.65 each), five clean 1.0s => blended high
    expect(s!.blended).toBeGreaterThan(0.8)
    expect(s!.today).toBe(1) // no log today = clean
  })
  it('a heavy week reads low but never zero-crashes on the usual amount', () => {
    const w = win(def(), { 0: 4, 1: 4, 2: 4, 3: 4, 8: 2, 12: 2, 15: 2 })
    const s = scoreStream(w, KEYS)!
    // baseline is median(4,4,4,4,2,2,2)=4; the four heavy days each land AT the
    // baseline (0.65), the three silent week-days are clean 1.0s
    expect(s.today).toBeCloseTo(BASELINE_SCORE)
    expect(s.blended).toBeGreaterThan(BASELINE_SCORE)
    expect(s.blended).toBeLessThan(1)
  })
  it('direction up skips missing days instead of treating them as zero', () => {
    // reading minutes, goal up, usual 30 — logged 3 of 7 days at usual
    const w = win(def({ key: 'reading', canonicalKey: 'reading', label: 'Reading', kind: 'duration', goalDirection: 'up' }), {
      0: 30, 2: 30, 5: 30, 9: 30, 14: 30,
    })
    const s = scoreStream(w, KEYS)!
    expect(s.blended).toBe(1) // missing days skipped, logged days all at usual
    expect(s.today).toBe(1)
  })
})

describe('scoreStream — cadence (done / measure / no direction)', () => {
  it('a 3-a-week habit hit 3 times this week scores 1.0', () => {
    // 12 report days in 28 => expected 3/week; 3 in the last 7
    const w = win(def({ key: 'meditate', canonicalKey: 'meditate', label: 'Meditate', kind: 'done', goalDirection: 'up' }), {
      0: 1, 3: 1, 6: 1, 8: 1, 10: 1, 12: 1, 14: 1, 17: 1, 20: 1, 22: 1, 24: 1, 27: 1,
    })
    const s = scoreStream(w, KEYS)!
    expect(s.mode).toBe('cadence')
    expect(s.blended).toBe(1)
    expect(s.last7Avg).toBe(s.blended) // flat trend, Train's precedent
  })
  it('the same habit hit once this week scores a third', () => {
    const w = win(def({ key: 'meditate', canonicalKey: 'meditate', label: 'Meditate', kind: 'done', goalDirection: 'up' }), {
      0: 1, 8: 1, 10: 1, 12: 1, 14: 1, 17: 1, 20: 1, 22: 1, 24: 1, 27: 1, 26: 1, 25: 1,
    })
    const s = scoreStream(w, KEYS)!
    expect(s.blended).toBeCloseTo(1 / 3)
  })
  it('expected cadence is clamped to at least 1 a week', () => {
    // 5 report days in 28 => round(5/4)=1 expected; 1 hit this week = 1.0
    const w = win(def({ key: 'weigh', canonicalKey: 'weigh', label: 'Weigh-in', kind: 'measure', goalDirection: null }), {
      2: 80, 9: 80, 16: 80, 23: 80, 27: 80,
    })
    const s = scoreStream(w, KEYS)!
    expect(s.blended).toBe(1)
  })
})

describe('combineStreamScores — the ONE Tiles slot', () => {
  const base = { mode: 'cadence' as const, earliestDataKey: KEYS[10] }
  it('averages streams equally inside the single slot', () => {
    const combined = combineStreamScores([
      { key: 'a', canonicalKey: 'a', label: 'A', blended: 1, today: 1, last7Avg: 1, ...base },
      { key: 'b', canonicalKey: 'b', label: 'B', blended: 0.5, today: 0, last7Avg: 0.5, ...base },
    ])!
    expect(combined.key).toBe('tiles')
    expect(combined.label).toBe('Tiles')
    expect(combined.blended).toBeCloseTo(0.75)
    expect(combined.today).toBeCloseTo(0.5)
    expect(combined.last7Avg).toBeCloseTo(0.75)
  })
  it('earliestDataKey is the oldest across streams', () => {
    const combined = combineStreamScores([
      { key: 'a', canonicalKey: 'a', label: 'A', blended: 1, today: 1, last7Avg: 1, mode: 'cadence', earliestDataKey: KEYS[3] },
      { key: 'b', canonicalKey: 'b', label: 'B', blended: 1, today: 1, last7Avg: 1, mode: 'cadence', earliestDataKey: KEYS[20] },
    ])!
    expect(combined.earliestDataKey).toBe(KEYS[20])
  })
  it('null when nothing is scoreable (inactive, never a fake zero)', () => {
    expect(combineStreamScores([])).toBeNull()
  })
})

describe('buildStreamWindows — raw rows to daily windows', () => {
  it('collapses same-day rows by the kind\'s aggregation (intake sums)', () => {
    const reports: TileReportRow[] = [
      { streamKey: 'beer', value: 1, date: KEYS[1] },
      { streamKey: 'beer', value: 2, date: KEYS[1] },
      { streamKey: 'beer', value: 3, date: KEYS[2] },
    ]
    const [w] = buildStreamWindows([def()], reports)
    expect(w.byDay.get(KEYS[1])).toBe(3)
    expect(w.byDay.get(KEYS[2])).toBe(3)
  })
  it('drops rows with no matching stream definition', () => {
    const reports: TileReportRow[] = [{ streamKey: 'ghost', value: 1, date: KEYS[0] }]
    const [w] = buildStreamWindows([def()], reports)
    expect(w.byDay.size).toBe(0)
  })
  it('TWO tiles sharing a key read as two separate windows, never merged or double-counted (PATCH21)', () => {
    const streams = [
      def({ id: 's1', tileId: 'tileA' }),
      def({ id: 's2', tileId: 'tileB', label: 'Craft brews' }),
    ]
    const reports: TileReportRow[] = [
      { streamId: 's1', streamKey: 'beer', value: 2, date: KEYS[1] },
      { streamId: 's2', streamKey: 'beer', value: 9, date: KEYS[1] },
    ]
    const [a, b] = buildStreamWindows(streams, reports)
    expect(a.byDay.get(KEYS[1])).toBe(2) // tileA sees only ITS datapoint
    expect(b.byDay.get(KEYS[1])).toBe(9) // tileB likewise, no 11 anywhere
  })
  it('a legacy row without streamId never fans out into two same-key tiles', () => {
    const streams = [def({ id: 's1', tileId: 'tileA' }), def({ id: 's2', tileId: 'tileB' })]
    const reports: TileReportRow[] = [{ streamKey: 'beer', value: 4, date: KEYS[1] }]
    const [a, b] = buildStreamWindows(streams, reports)
    // ambiguous ownership: counted in NEITHER rather than doubled into both
    expect(a.byDay.size).toBe(0)
    expect(b.byDay.size).toBe(0)
  })
})

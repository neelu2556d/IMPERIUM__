import {
  computeSessionVerdict,
  verdictHeadline,
  verdictStory,
} from '@/lib/workouts/sessionVerdict'
import type { SavedExercise, SavedSet } from '@/lib/workouts/queries'

// ── tiny builders so each test reads as the lifting scenario it describes ──
function s(weight: number, reps: number, opts: { done?: boolean; failed?: boolean } = {}): SavedSet {
  return { weight, reps, done: opts.done ?? true, failed: opts.failed ?? false }
}
function ex(id: string, sets: SavedSet[], targetReps = 5): SavedExercise {
  return { id, name: id, targetSets: sets.length, targetReps, sets }
}

describe('computeSessionVerdict — per lift', () => {
  test('a heavier top set than last time is a new best', () => {
    const v = computeSessionVerdict(
      [ex('bench', [s(85, 5), s(85, 5)])],
      [ex('bench', [s(82.5, 5), s(82.5, 5)])],
    )
    expect(v.lifts[0].verdict).toBe('best')
    expect(v.lifts[0].counted).toBe(true)
    expect(v.hasNewBest).toBe(true)
  })

  test('same weight with more reps is stronger (up)', () => {
    const v = computeSessionVerdict(
      [ex('bench', [s(85, 6)])],
      [ex('bench', [s(85, 5)])],
    )
    expect(v.lifts[0].verdict).toBe('up')
  })

  test('same top set but fewer total sets is lighter (down)', () => {
    const v = computeSessionVerdict(
      [ex('ohp', [s(52.5, 6)])],
      [ex('ohp', [s(52.5, 6), s(52.5, 6), s(52.5, 6)])],
    )
    expect(v.lifts[0].verdict).toBe('down')
  })

  test('identical work holds the line (held)', () => {
    const v = computeSessionVerdict(
      [ex('row', [s(60, 8), s(60, 8)])],
      [ex('row', [s(60, 8), s(60, 8)])],
    )
    expect(v.lifts[0].verdict).toBe('held')
  })

  test('a lift with no prior history is new and not counted', () => {
    const v = computeSessionVerdict(
      [ex('lateral', [s(14, 12)])],
      [ex('bench', [s(85, 5)])],
    )
    const lat = v.lifts.find(l => l.id === 'lateral')!
    expect(lat.verdict).toBe('new')
    expect(lat.counted).toBe(false)
    expect(v.newCount).toBe(1)
  })

  test('failed and empty sets are excluded from the comparison', () => {
    // The failed 100kg set must NOT promote the top to a fake new best;
    // the empty set must not exist. Top stays the one real 85x5, so vs an
    // identical last session this reads held.
    const v = computeSessionVerdict(
      [ex('bench', [s(85, 5), s(100, 5, { failed: true }), s(0, 0, { done: false })])],
      [ex('bench', [s(85, 5)])],
    )
    expect(v.lifts[0].topWeight).toBe(85)
    expect(v.lifts[0].verdict).toBe('held')
  })

  test('a lift the user did not log this session is dropped entirely', () => {
    const v = computeSessionVerdict(
      [ex('bench', [s(85, 5)]), ex('ohp', [s(0, 0, { done: false })])],
      [ex('bench', [s(85, 5)]), ex('ohp', [s(50, 6)])],
    )
    expect(v.lifts.map(l => l.id)).toEqual(['bench'])
  })
})

describe('computeSessionVerdict — overall', () => {
  test('more lifts stronger than lighter nets stronger overall', () => {
    const v = computeSessionVerdict(
      [ex('a', [s(50, 6)]), ex('b', [s(50, 6)]), ex('c', [s(40, 6)])],
      [ex('a', [s(45, 6)]), ex('b', [s(45, 6)]), ex('c', [s(50, 6)])],
    )
    expect(v.strongerCount).toBe(2)
    expect(v.lighterCount).toBe(1)
    expect(v.tier).toBe('stronger')
  })

  test('more lifts lighter than stronger nets a lighter day', () => {
    const v = computeSessionVerdict(
      [ex('a', [s(85, 5)]), ex('b', [s(40, 8)]), ex('c', [s(40, 8)]), ex('d', [s(40, 8)])],
      [ex('a', [s(82.5, 5)]), ex('b', [s(50, 8)]), ex('c', [s(50, 8)]), ex('d', [s(50, 8)])],
    )
    expect(v.tier).toBe('lighter')
  })

  test('first ever session with no comparison reads as fresh', () => {
    const v = computeSessionVerdict([ex('bench', [s(85, 5)])], null)
    expect(v.tier).toBe('fresh')
    expect(v.lifts[0].verdict).toBe('new')
    expect(v.volumeDeltaPct).toBeNull()
  })

  test('volume delta percent reflects matched lifts only, rounded', () => {
    // this bench volume 850 (85x5 + 85x5), last 800 (80x5 + 80x5) -> +6.25% -> 6
    const v = computeSessionVerdict(
      [ex('bench', [s(85, 5), s(85, 5)])],
      [ex('bench', [s(80, 5), s(80, 5)])],
    )
    expect(v.volumeDeltaPct).toBe(6)
  })

  test('an even split breaks toward total volume', () => {
    // a: up (110 vol vs 100), b: down (95 vol vs 100). counts tie 1-1.
    // total this 205 vs last 200 -> +2.5% -> stronger.
    const v = computeSessionVerdict(
      [ex('a', [s(110, 1)]), ex('b', [s(95, 1)])],
      [ex('a', [s(100, 1)]), ex('b', [s(100, 1)])],
    )
    expect(v.strongerCount).toBe(1)
    expect(v.lighterCount).toBe(1)
    expect(v.tier).toBe('stronger')
  })
})

describe('verdict copy', () => {
  const benchPR = computeSessionVerdict(
    [ex('Barbell bench', [s(85, 5)]), ex('OHP', [s(40, 6)])],
    [ex('Barbell bench', [s(82.5, 5)]), ex('OHP', [s(50, 6)])],
  )
  const fresh = computeSessionVerdict([ex('Barbell bench', [s(85, 5)])], null)

  test('headline matches the tier and never uses an em dash', () => {
    expect(verdictHeadline('stronger')).toBe('Stronger overall')
    expect(verdictHeadline('held')).toBe('Held your ground')
    expect(verdictHeadline('lighter')).toBe('A lighter day')
    for (const t of ['stronger', 'held', 'lighter', 'fresh'] as const) {
      expect(verdictHeadline(t)).not.toContain('—')
    }
  })

  test('a new-best story names the lift and the day, with no em dash', () => {
    const story = verdictStory(benchPR, 'Push')
    expect(story).toContain('Barbell bench')
    expect(story).toContain('Push')
    expect(story).not.toContain('—')
  })

  test('a first-ever session reads forward, not as a comparison', () => {
    const story = verdictStory(fresh, 'Push')
    expect(story).toContain('Push')
    expect(story.toLowerCase()).not.toContain('last')
    expect(story).not.toContain('—')
  })
})

/**
 * Tests for the Vitality Score engine pure functions (lib/vitality/*).
 * No IO — these exercise the blending math, score combination, and the
 * per-contributor done/rate calculations. Run with:
 *   npx jest vitalityScore --testPathIgnorePatterns "/node_modules/"
 */
import { WEIGHTS, weightedBlend, combineResults, runContributors, type ContributorResult, type Contributor, type ScoreContext } from '@/lib/vitality/score'
import { fuelDoneByDay } from '@/lib/vitality/contributors/fuel'
import { trainTargetPerWeek, trainRate } from '@/lib/vitality/contributors/train'

describe('weightedBlend', () => {
  it('returns 0 for an all-zero week', () => {
    expect(weightedBlend([0, 0, 0, 0, 0, 0, 0])).toBe(0)
  })

  it('returns 1 for a perfect week', () => {
    expect(weightedBlend([1, 1, 1, 1, 1, 1, 1])).toBeCloseTo(1, 6)
  })

  it('weights today heaviest', () => {
    const total = WEIGHTS.reduce((a, b) => a + b, 0)
    expect(weightedBlend([1, 0, 0, 0, 0, 0, 0])).toBeCloseTo(WEIGHTS[0] / total, 6)
  })

  it('skips null/undefined days (missing data is not a zero)', () => {
    expect(weightedBlend([1, null])).toBeCloseTo(1, 6)
  })

  it('returns 0 when every day is missing', () => {
    expect(weightedBlend([null, null])).toBe(0)
  })
})

describe('combineResults', () => {
  const today = '2026-06-13'
  const mk = (over: Partial<ContributorResult>): ContributorResult => ({
    key: 'x', label: 'X', blended: 0.5, today: 0.5, last7Avg: 0.5, earliestDataKey: '2026-06-01', ...over,
  })

  it('averages active contributors and rounds to 0-100', () => {
    const out = combineResults([mk({ blended: 0.8 }), mk({ blended: 0.6 })], today)
    expect(out.score).toBe(70)
    expect(out.state).toBe('scored')
    expect(out.drivers).toHaveLength(2)
  })

  it('reports no-routine with null score when there are no results', () => {
    const out = combineResults([], today)
    expect(out.score).toBeNull()
    expect(out.state).toBe('no-routine')
    expect(out.drivers).toEqual([])
  })

  it('is first-day when the only data is today', () => {
    const out = combineResults([mk({ earliestDataKey: today })], today)
    expect(out.state).toBe('first-day')
    expect(out.score).not.toBeNull()
  })

  it('is first-day when there is no logged data at all', () => {
    const out = combineResults([mk({ earliestDataKey: null, blended: 0 })], today)
    expect(out.state).toBe('first-day')
  })

  it('derives trend up/down/flat from blended vs last7Avg', () => {
    const out = combineResults([
      mk({ key: 'a', blended: 0.9, last7Avg: 0.5 }),
      mk({ key: 'b', blended: 0.4, last7Avg: 0.5 }),
      mk({ key: 'c', blended: 0.52, last7Avg: 0.5 }),
    ], today)
    const byKey = Object.fromEntries(out.drivers.map(d => [d.key, d.trend]))
    expect(byKey.a).toBe('up')
    expect(byKey.b).toBe('down')
    expect(byKey.c).toBe('flat')
  })
})

describe('fuelDoneByDay', () => {
  const keys = ['2026-06-13', '2026-06-12', '2026-06-11']

  it('is the fraction of the calorie goal hit, capped at 1', () => {
    const kcalByDay = { '2026-06-13': 1200, '2026-06-12': 2400, '2026-06-11': 3000 }
    expect(fuelDoneByDay(kcalByDay, 2400, keys)).toEqual([0.5, 1, 1])
  })

  it('is 0 for a day with no logged meals', () => {
    expect(fuelDoneByDay({ '2026-06-13': 1200 }, 2400, keys)).toEqual([0.5, 0, 0])
  })

  it('returns all-zero when the target is missing or zero (avoids divide-by-zero)', () => {
    expect(fuelDoneByDay({ '2026-06-13': 1200 }, 0, keys)).toEqual([0, 0, 0])
  })
})

describe('trainTargetPerWeek', () => {
  it('scales the non-rest ratio of the rotation to a weekly target', () => {
    const ppl = [
      { category: 'push' }, { category: 'pull' }, { category: 'legs' }, { category: 'rest' },
    ]
    expect(trainTargetPerWeek(ppl)).toBe(5) // round(3/4 * 7)
  })

  it('handles a calendar-week split (7 entries, 4 lift / 3 rest)', () => {
    const week = [
      { category: 'push' }, { category: 'legs' }, { category: 'rest' },
      { category: 'pull' }, { category: 'legs' }, { category: 'rest' }, { category: 'rest' },
    ]
    expect(trainTargetPerWeek(week)).toBe(4)
  })

  it('never returns less than 1 for a set-up split', () => {
    expect(trainTargetPerWeek([{ category: 'push' }, { category: 'rest' }, { category: 'rest' }, { category: 'rest' }, { category: 'rest' }, { category: 'rest' }, { category: 'rest' }])).toBe(1)
  })

  it('returns 0 for an empty or all-rest rotation', () => {
    expect(trainTargetPerWeek([])).toBe(0)
    expect(trainTargetPerWeek([{ category: 'rest' }, { category: 'rest' }])).toBe(0)
  })

  it('treats type RECOVERY as a rest day even without category rest', () => {
    const rotation = [
      { category: 'push', type: 'HEAVY' }, { category: 'pull', type: 'VOLUME' },
      { type: 'RECOVERY' }, { type: 'RECOVERY' },
    ]
    expect(trainTargetPerWeek(rotation)).toBe(4) // round(2/4 * 7)
  })
})

describe('trainRate', () => {
  const windowDates = ['2026-06-13', '2026-06-12', '2026-06-11', '2026-06-10', '2026-06-09', '2026-06-08', '2026-06-07']

  it('is logged sessions over the weekly target, capped at 1', () => {
    const logged = ['2026-06-13', '2026-06-11', '2026-06-09']
    expect(trainRate(5, logged, windowDates)).toBeCloseTo(0.6, 6)
  })

  it('caps at 1 when you train more than the target', () => {
    const logged = ['2026-06-13', '2026-06-12', '2026-06-11', '2026-06-10', '2026-06-09', '2026-06-08']
    expect(trainRate(3, logged, windowDates)).toBe(1)
  })

  it('counts a date only once even if it appears twice', () => {
    expect(trainRate(2, ['2026-06-13', '2026-06-13'], windowDates)).toBeCloseTo(0.5, 6)
  })

  it('ignores logged dates outside the window', () => {
    expect(trainRate(2, ['2026-06-01', '2026-06-13'], windowDates)).toBeCloseTo(0.5, 6)
  })

  it('returns 0 when the target is 0', () => {
    expect(trainRate(0, ['2026-06-13'], windowDates)).toBe(0)
  })
})

describe('runContributors (safety nets)', () => {
  const ctx = { supabase: {} as never, userId: 'u1' }
  const today = '2026-06-13'

  const ok = (key: string, blended: number): Contributor => ({
    key,
    label: key,
    isActive: async () => true,
    evaluate: async () => ({ key, label: key, blended, today: blended, last7Avg: blended, earliestDataKey: '2026-06-01' }),
  })

  it('scores active contributors normally', async () => {
    const out = await runContributors(ctx as ScoreContext, [ok('a', 0.8), ok('b', 0.6)], today)
    expect(out.score).toBe(70)
    expect(out.state).toBe('scored')
  })

  it('drops a contributor whose isActive throws, still scores the rest', async () => {
    const boom: Contributor = { key: 'boom', label: 'boom', isActive: async () => { throw new Error('x') }, evaluate: async () => { throw new Error('should not run') } }
    const out = await runContributors(ctx as ScoreContext, [boom, ok('a', 0.8)], today)
    expect(out.score).toBe(80)
    expect(out.drivers.map(d => d.key)).toEqual(['a'])
  })

  it('drops a contributor whose evaluate throws, still scores the rest', async () => {
    const evalBoom: Contributor = { key: 'eb', label: 'eb', isActive: async () => true, evaluate: async () => { throw new Error('x') } }
    const out = await runContributors(ctx as ScoreContext, [evalBoom, ok('a', 0.4)], today)
    expect(out.score).toBe(40)
    expect(out.drivers.map(d => d.key)).toEqual(['a'])
  })

  it('returns no-routine when no contributor is active', async () => {
    const inactive: Contributor = { key: 'i', label: 'i', isActive: async () => false, evaluate: async () => { throw new Error('should not run') } }
    const out = await runContributors(ctx as ScoreContext, [inactive], today)
    expect(out.score).toBeNull()
    expect(out.state).toBe('no-routine')
  })

  it('returns no-routine when every active contributor fails to evaluate', async () => {
    const evalBoom: Contributor = { key: 'eb', label: 'eb', isActive: async () => true, evaluate: async () => { throw new Error('x') } }
    const out = await runContributors(ctx as ScoreContext, [evalBoom], today)
    expect(out.score).toBeNull()
    expect(out.state).toBe('no-routine')
  })
})

/**
 * "What steers this" (TRAIN 4): the binding override wins over auto-binding.
 * buildTicker must honor a user-picked metric first, draw stream-bound goals
 * from the user's own tile reports, and never let a blocked auto-binding sneak
 * back in. Plus the pure picker helpers (options per category, feed lines).
 */
import { buildTicker, type TickerInput } from '@/lib/insights/ticker'
import { bindingFeedLine, bindingMetricWord, coreBindingOptions } from '@/lib/insights/goalGuide'

const WEIGH_INS = [
  { date: '2026-07-01', kg: 84.0 },
  { date: '2026-07-04', kg: 83.6 },
  { date: '2026-07-08', kg: 83.1 },
]

function base(over: Partial<TickerInput> = {}): TickerInput {
  return {
    goals: [],
    weighIns: [],
    goalDirection: null,
    workoutDatesLast21: [],
    lifts: [],
    ...over,
  }
}

describe('buildTicker binding override', () => {
  it('override "weight" binds weigh-ins to a goal whose title never mentions the body', () => {
    const rows = buildTicker(base({
      goals: [{ id: 'g1', title: 'feel like myself again', cleanTitle: null, category: 'general', bindingOverride: 'weight' }],
      weighIns: WEIGH_INS,
      goalDirection: 'lose',
    }))
    expect(rows[0].metric).toBe('weight')
    expect(rows[0].state).toBe('on-track')
    expect(rows[0].spark.length).toBe(3)
  })

  it('override blocks auto-binding: a weight-worded goal steered to notes gets no scale graph', () => {
    const rows = buildTicker(base({
      goals: [{ id: 'g1', title: 'lose weight', cleanTitle: null, category: 'health', bindingOverride: 'notes' }],
      weighIns: WEIGH_INS,
      goalDirection: 'lose',
    }))
    expect(rows[0].metric).toBeNull()
    expect(rows[0].state).toBe('unknown')
    expect(rows[0].spark).toEqual([])
    expect(rows[0].detail).toBeNull()
  })

  it('override "stream:<key>" draws the user tile stream, honoring its goal direction', () => {
    const rows = buildTicker(base({
      goals: [{ id: 'g1', title: 'read 12 books', cleanTitle: null, category: 'mind', bindingOverride: 'stream:pages_read' }],
      streams: [{
        canonicalKey: 'pages_read', label: 'Pages read', goalDirection: 'up',
        points: [
          { date: '2026-07-02', value: 12 },
          { date: '2026-07-05', value: 20 },
          { date: '2026-07-08', value: 31 },
        ],
      }],
    }))
    expect(rows[0].metric).toBe('stream')
    expect(rows[0].state).toBe('on-track')
    expect(rows[0].spark).toEqual([12, 20, 31])
    expect(rows[0].detail).toBe('12 → 31')
  })

  it('a down-direction stream rising reads as drifting; a thin stream stays an honest hint', () => {
    const input = base({
      goals: [
        { id: 'g1', title: 'drink less beer', cleanTitle: null, category: 'health', bindingOverride: 'stream:alcohol' },
        { id: 'g2', title: 'read more', cleanTitle: null, category: 'mind', bindingOverride: 'stream:missing' },
      ],
      streams: [{
        canonicalKey: 'alcohol', label: 'Beers', goalDirection: 'down',
        points: [
          { date: '2026-07-02', value: 2 },
          { date: '2026-07-08', value: 5 },
        ],
      }],
    })
    const rows = buildTicker(input)
    expect(rows[0].state).toBe('drifting')
    expect(rows[1].state).toBe('unknown')
    expect(rows[1].detail).toBeNull()
    expect(rows[1].hint).toContain('log to your tile')
  })

  it('override "train" falls to the honest workout hint with zero sessions', () => {
    const rows = buildTicker(base({
      goals: [{ id: 'g1', title: 'be more disciplined', cleanTitle: null, category: 'general', bindingOverride: 'train' }],
    }))
    expect(rows[0].state).toBe('unknown')
    expect(rows[0].hint).toBe('log a workout to see your trend')
  })

  it('no override leaves the auto-binding untouched', () => {
    const rows = buildTicker(base({
      goals: [{ id: 'g1', title: 'get leaner', cleanTitle: null, category: 'health' }],
      weighIns: WEIGH_INS,
      goalDirection: 'lose',
    }))
    expect(rows[0].metric).toBe('weight')
  })
})

describe('binding picker helpers', () => {
  it('feed lines are metric-specific and notes never over-promises a graph', () => {
    expect(bindingFeedLine('weight')).toBe('for this graph to work, start logging your weight.')
    expect(bindingFeedLine('notes')).toContain('write a note each day')
  })

  it('metric words name the chip', () => {
    expect(bindingMetricWord('weight')).toBe('weight')
    expect(bindingMetricWord('finance')).toBe('net worth')
  })

  it('core options fit the category and always include the notes floor', () => {
    expect(coreBindingOptions('money')).toEqual(['finance', 'notes'])
    expect(coreBindingOptions('fitness')).toContain('train')
    for (const cat of ['fitness', 'health', 'money', 'audience', 'mind', 'people', 'career', 'craft', 'general', null]) {
      expect(coreBindingOptions(cat)).toContain('notes')
    }
  })
})

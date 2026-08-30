import { buildLifeChips } from '@/lib/insights/lifeChips'

describe('buildLifeChips', () => {
  it('returns nothing when there is no real data (never invents a chip)', () => {
    expect(buildLifeChips({ sessionsPerWeek: null, sleepAvgH: null, recovery: null, weightKg: null, waterL: null })).toEqual([])
  })

  it('builds honest chips from real numbers, flagging low sleep amber', () => {
    const chips = buildLifeChips({ sessionsPerWeek: 5, sleepAvgH: 5.6, recovery: 68, weightKg: 74.6, waterL: null })
    const labels = chips.map(c => c.label)
    expect(labels).toContain('train')
    expect(labels).toContain('sleep')
    const sleep = chips.find(c => c.label === 'sleep')!
    expect(sleep.value).toMatch(/5\.6/)
    expect(sleep.tone).toBe('amber') // under 6h
    const train = chips.find(c => c.label === 'train')!
    expect(train.value).toMatch(/wk/)
  })

  it('omits chips whose data is missing', () => {
    const chips = buildLifeChips({ sessionsPerWeek: null, sleepAvgH: null, recovery: null, weightKg: 80, waterL: 2.1 })
    expect(chips.map(c => c.label).sort()).toEqual(['water', 'weight'])
  })
})

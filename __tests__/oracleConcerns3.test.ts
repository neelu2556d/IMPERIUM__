import { recoveryDipConcern } from '@/lib/oracle/concerns'

// Recovery sliding is a goal-agnostic converging signal (it pairs with a stalled
// lift or a weight drift to make a green light). Newest-first recovery readings;
// fires only on a real drop with enough readings (mirrors the drift gate).

describe('recoveryDipConcern', () => {
  test('a real recent drop -> a goal-agnostic recovery concern', () => {
    const entries = [
      { recovery: 55 }, { recovery: 54 }, { recovery: 56 }, { recovery: 53 }, { recovery: 55 },
      { recovery: 70 }, { recovery: 72 }, { recovery: 71 }, { recovery: 69 }, { recovery: 70 },
    ]
    const c = recoveryDipConcern(entries)
    expect(c).toHaveLength(1)
    expect(c[0].domain).toBe('recovery')
    expect(c[0].goalRefs).toEqual([])
    expect(c[0].margin).toBeGreaterThanOrEqual(12)
  })

  test('steady recovery -> no concern', () => {
    const entries = Array.from({ length: 10 }, () => ({ recovery: 70 }))
    expect(recoveryDipConcern(entries)).toEqual([])
  })

  test('too few readings -> no concern', () => {
    expect(recoveryDipConcern([{ recovery: 50 }, { recovery: 51 }, { recovery: 70 }, { recovery: 72 }])).toEqual([])
  })

  test('ignores null (no-band) days', () => {
    const entries = [
      { recovery: null }, { recovery: 55 }, { recovery: 54 }, { recovery: 56 }, { recovery: 53 },
      { recovery: null }, { recovery: 70 }, { recovery: 72 }, { recovery: 71 }, { recovery: 70 },
    ]
    expect(recoveryDipConcern(entries)).toHaveLength(1)
  })
})

import { selectFusion, relContrast, type FusionCandidate } from '@/lib/insights/fusionSelect'

const cand = (p: Partial<FusionCandidate>): FusionCandidate => ({
  notice: { why: 'a link', key: 'a link', receipts: ['x', 'y'] },
  watched: 'a + b',
  score: { domains: ['a', 'b'], r: 0.5, n: 10, contrast: 0.3 },
  ...p,
})

describe('relContrast — a unitless effect size so seams in different units compare fairly', () => {
  it('is the gap as a fraction of the average magnitude', () => {
    expect(relContrast(71, 58)).toBeCloseTo(13 / 64.5, 3) // recovery %: ~0.20
    expect(relContrast(4, 2)).toBeCloseTo(2 / 3, 3)        // sessions/wk: ~0.67
  })
  it('is 0 when the halves are equal, and never divides by zero', () => {
    expect(relContrast(5, 5)).toBe(0)
    expect(relContrast(0, 0)).toBe(0)
  })
  it('ignores order (magnitude only)', () => {
    expect(relContrast(58, 71)).toBeCloseTo(relContrast(71, 58), 6)
  })
})

describe('selectFusion — the engine picks the ONE fusion notice to show', () => {
  it('returns null when no seam fired', () => {
    expect(selectFusion([])).toBeNull()
    expect(selectFusion([null, undefined])).toBeNull()
  })

  it('returns the only candidate when a single seam fired', () => {
    const only = cand({ watched: 'caffeine + recovery' })
    expect(selectFusion([null, only])).toBe(only)
  })

  it('among two single-link seams, returns the stronger one', () => {
    const weak = cand({ watched: 'sleep + training', score: { domains: ['sleep', 'training'], r: 0.45, n: 6, contrast: 0.3 } })
    const strong = cand({ watched: 'caffeine + recovery', score: { domains: ['caffeine', 'recovery'], r: -0.8, n: 14, contrast: 0.5 } })
    expect(selectFusion([weak, strong])).toBe(strong)
  })

  it('a deeper convergence beats a stronger shallow seam (depth is the prize)', () => {
    const brick = cand({ watched: 'caffeine + recovery', score: { domains: ['caffeine', 'recovery'], r: -0.9, n: 20, contrast: 1 } })
    const spiral = cand({ watched: 'spend + training + mood', score: { domains: ['spend', 'training', 'mood'], r: 0.5, n: 8, contrast: 0.5 } })
    expect(selectFusion([brick, spiral])).toBe(spiral)
  })
})

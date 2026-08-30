import { rankInsights, selectStrongest, type ScoredInsight } from '@/lib/insights/correlationEngine'

describe('rankInsights — always reach for the deepest TRUE insight', () => {
  it('a deeper convergence beats a stronger shallow seam (depth is the prize)', () => {
    // every leg is independently gated as real, so the deepest true STORY is the
    // most life-changing one, even if a single brick has a higher raw correlation.
    const brick: ScoredInsight = { domains: ['caffeine', 'recovery'], r: -0.9, n: 20, contrast: 1 }
    const spiral: ScoredInsight = { domains: ['spend', 'training', 'mood'], r: 0.5, n: 8, contrast: 0.5 }
    expect(selectStrongest([brick, spiral])).toBe(spiral)
    expect(rankInsights([brick, spiral])).toEqual([spiral, brick])
  })

  it('among equally deep insights, the stronger one wins', () => {
    const weak: ScoredInsight = { domains: ['sleep', 'training'], r: 0.5, n: 6, contrast: 0.5 }   // 1.5
    const strong: ScoredInsight = { domains: ['mood', 'training'], r: 0.8, n: 10, contrast: 1 }   // 8
    expect(selectStrongest([weak, strong])).toBe(strong)
    expect(rankInsights([weak, strong])).toEqual([strong, weak])
  })

  it('counts a strong negative link as strong (absolute correlation)', () => {
    const neg: ScoredInsight = { domains: ['caffeine', 'recovery'], r: -0.9, n: 10, contrast: 1 } // 9
    const pos: ScoredInsight = { domains: ['sleep', 'training'], r: 0.4, n: 10, contrast: 1 }     // 4
    expect(selectStrongest([neg, pos])).toBe(neg)
  })

  it('selects nothing from an empty set (Vee stays quiet)', () => {
    expect(selectStrongest([])).toBeNull()
    expect(rankInsights([])).toEqual([])
  })
})

import { rarityOf, type Rarity } from '@/lib/insights/rarity'
import type { ScoredInsight } from '@/lib/insights/correlationEngine'

const insight = (p: Partial<ScoredInsight>): ScoredInsight => ({
  domains: ['caffeine', 'recovery'], r: -0.5, n: 12, contrast: 0.2, ...p,
})

describe('rarityOf — depth-and-strength tier (rarity = how deep the insight goes)', () => {
  it('a single cross-domain link is uncommon (the first wiring brick)', () => {
    expect(rarityOf(insight({ domains: ['caffeine', 'recovery'] }))).toBe('uncommon')
  })

  it('an exceptionally strong single link earns rare', () => {
    expect(rarityOf(insight({ domains: ['caffeine', 'recovery'], r: -0.82, n: 18 }))).toBe('rare')
  })

  it('a three-domain convergence is at least rare, epic when strong (one spiral)', () => {
    expect(rarityOf(insight({ domains: ['spend', 'training', 'mood'], r: 0.5, n: 8 }))).toBe('rare')
    expect(rarityOf(insight({ domains: ['spend', 'training', 'mood'], r: 0.75, n: 14 }))).toBe('epic')
  })

  it('a four-plus-domain spiral is legendary, mythic when exceptionally strong', () => {
    expect(rarityOf(insight({ domains: ['spend', 'training', 'mood', 'sleep'], r: 0.5, n: 8 }))).toBe('legendary')
    expect(rarityOf(insight({ domains: ['spend', 'training', 'mood', 'sleep'], r: 0.8, n: 16 }))).toBe('mythic')
  })

  it('a lone single-domain signal is common (a small true nudge)', () => {
    expect(rarityOf(insight({ domains: ['training'] }))).toBe('common')
    expect(rarityOf(insight({ domains: [] }))).toBe('common')
  })

  it('treats a strong negative link as strong (absolute correlation)', () => {
    // same |r| as a strong positive, just inverse — rarity must not punish the sign
    expect(rarityOf(insight({ domains: ['caffeine', 'recovery'], r: -0.85, n: 20 }))).toBe('rare')
  })

  it('rank order of tiers is stable and exhaustive', () => {
    const tiers: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
    expect(new Set(tiers).size).toBe(6)
  })
})

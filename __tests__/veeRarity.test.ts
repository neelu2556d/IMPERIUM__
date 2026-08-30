import {
  rarityForNotice,
  buildCollection,
  collectionTotal,
  watchedDepth,
  normalizeRarity,
  type Rarity,
} from '@/lib/vee/rarity'

describe('rarityForNotice — maps a real insight to an OG-loot tier', () => {
  it('honors the engine grade verbatim when one was set', () => {
    expect(rarityForNotice({ source: 'fusion', rarity: 'legendary', watched: 'a', receipts: [] })).toBe('legendary')
    expect(rarityForNotice({ source: 'fusion', rarity: 'mythic' })).toBe('mythic')
  })

  it('a momentum row (single thread) is a common nudge', () => {
    expect(rarityForNotice({ source: 'momentum', watched: 'your lifts', receipts: ['x'] })).toBe('common')
  })

  it('a drift nudge floors at uncommon', () => {
    expect(rarityForNotice({ source: 'drift', watched: 'training - 21d', receipts: [] })).toBe('uncommon')
  })

  it('a first-find floors at common (day-one observation, never a graded seam)', () => {
    expect(rarityForNotice({ source: 'first', watched: 'training · 7d', receipts: ['1 session this week'] })).toBe('common')
    expect(rarityForNotice({ source: 'first', watched: 'your weigh-ins', receipts: ['82.4 kg · 2026-07-10'] })).toBe('common')
  })

  it('a two-domain fusion seam is rare, and three receipts push it to epic', () => {
    expect(rarityForNotice({ source: 'fusion', watched: 'caffeine + recovery', receipts: ['a'] })).toBe('epic')
    expect(rarityForNotice({ source: 'fusion', watched: 'caffeine + recovery', receipts: ['a', 'b', 'c'] })).toBe('legendary')
  })

  it('an oracle convergence across three domains reaches the top tiers', () => {
    expect(rarityForNotice({ source: 'oracle', watched: 'money · training · mood', receipts: ['a', 'b', 'c'] })).toBe('mythic')
  })

  it('unknown / malformed input degrades to common and never throws', () => {
    expect(rarityForNotice(null)).toBe('common')
    expect(rarityForNotice(undefined)).toBe('common')
    expect(rarityForNotice({})).toBe('common')
    expect(rarityForNotice({ source: 'nonsense', rarity: 'shiny', watched: 42 as unknown as string })).toBe('common')
  })
})

describe('watchedDepth — distinct life-domains from the watched label', () => {
  it('counts domains split on + · x and , stripping time windows', () => {
    expect(watchedDepth('caffeine + recovery')).toBe(2)
    expect(watchedDepth('money · training · mood')).toBe(3)
    expect(watchedDepth('sleep + training volume - 8wk')).toBe(2)
  })
  it('is 1 for a single label or missing input', () => {
    expect(watchedDepth('your lifts')).toBe(1)
    expect(watchedDepth(null)).toBe(1)
    expect(watchedDepth(undefined)).toBe(1)
  })
})

describe('normalizeRarity', () => {
  it('accepts valid tiers and rejects everything else', () => {
    expect(normalizeRarity('epic')).toBe('epic')
    expect(normalizeRarity('EPIC')).toBeNull()
    expect(normalizeRarity(3)).toBeNull()
    expect(normalizeRarity(null)).toBeNull()
  })
})

describe('buildCollection — the six-tier grid', () => {
  it('tallies counts, always returns six tiers, and marks the top as current', () => {
    const tiers = buildCollection(['common', 'common', 'rare', 'epic'])
    expect(tiers).toHaveLength(6)
    const rare = tiers.find(t => t.rarity === 'rare')!
    expect(rare.count).toBe(1)
    expect(tiers.find(t => t.rarity === 'common')!.count).toBe(2)
    // epic is the highest present -> current glow
    expect(tiers.find(t => t.cur)!.rarity).toBe('epic')
    expect(collectionTotal(tiers)).toBe(4)
  })

  it('an empty collection returns all six tiers at zero with no current', () => {
    const tiers = buildCollection([])
    expect(tiers).toHaveLength(6)
    expect(tiers.every(t => t.count === 0)).toBe(true)
    expect(tiers.some(t => t.cur)).toBe(false)
    expect(collectionTotal(tiers)).toBe(0)
  })

  it('handles garbage input without throwing', () => {
    expect(() => buildCollection(['bogus' as unknown as Rarity])).not.toThrow()
    expect(collectionTotal([])).toBe(0)
  })
})

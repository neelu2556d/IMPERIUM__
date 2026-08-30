/**
 * Tests for the common-food catalog (lib/nutrition/commonFoodCatalog.ts) — the
 * instant typo-tolerant funnel in front of the live USDA search. Pure, no IO.
 *   npx jest commonFoodCatalog --testPathIgnorePatterns "/node_modules/"
 */

import {
  matchCommonFoods,
  browseCategory,
  sizeOptionsFor,
  CATALOG_CATEGORIES,
  normFood,
} from '@/lib/nutrition/commonFoodCatalog'
import { COMMON_CATALOG } from '@/lib/nutrition/commonFoodCatalog.data'

const names = (q: string) => matchCommonFoods(q).map((c) => c.displayName)
const topName = (q: string) => matchCommonFoods(q)[0]?.displayName

describe('catalog data integrity', () => {
  it('has a broad catalog', () => {
    expect(COMMON_CATALOG.length).toBeGreaterThan(300)
  })

  it('every food has sane macros and a serving', () => {
    for (const f of COMMON_CATALOG) {
      expect(f.name.length).toBeGreaterThan(0)
      expect(f.per100.kcal).toBeGreaterThanOrEqual(0)
      expect(f.serving.grams).toBeGreaterThan(0)
      expect(f.serving.label.length).toBeGreaterThan(0)
      // macro identity: kcal ≈ 4P + 4C + 9F. Exempt Beverages — alcohol carries
      // 7 kcal/g that never shows up in P/C/F (wine, beer, cocktails).
      const computed = f.per100.protein * 4 + f.per100.carbs * 4 + f.per100.fat * 9
      if (f.per100.kcal > 20 && f.category !== 'Beverages') {
        const ratio = computed / f.per100.kcal
        expect(ratio).toBeGreaterThan(0.55)
        expect(ratio).toBeLessThan(1.8)
      }
    }
  })

  it('has no duplicate names', () => {
    const seen = new Set<string>()
    for (const f of COMMON_CATALOG) {
      const k = normFood(f.name)
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
  })
})

describe('typo-tolerant matching', () => {
  it('funnels misspellings to the right whole food', () => {
    expect(topName('bana')).toBe('Banana')
    expect(topName('banana')).toBe('Banana')
    expect(topName('bananana')).toBe('Banana')
    expect(names('chiken')).toContain('Chicken Breast')
    expect(names('avacado')).toContain('Avocado')
    expect(names('brocoli')).toContain('Broccoli')
    expect(names('potatoe')).toContain('White Potato')
    expect(names('yogert')).toContain('Greek Yogurt')
  })

  it('resolves multi-word and partial cuts', () => {
    expect(topName('chicken drum')).toBe('Chicken Drumstick')
    const ch = names('chicken')
    expect(ch).toContain('Chicken Breast')
    expect(ch).toContain('Chicken Thigh')
    // breadth: a 2-letter stem surfaces several distinct items
    expect(matchCommonFoods('ch').length).toBeGreaterThanOrEqual(4)
  })

  it('marks real misspellings as corrected, not plain partials', () => {
    // a clean prefix is a partial, not a correction
    const bana = matchCommonFoods('bana').find((c) => c.displayName === 'Banana')
    expect(bana?.corrected).toBe(false)
    const banana = matchCommonFoods('banana').find((c) => c.displayName === 'Banana')
    expect(banana?.corrected).toBe(false)
    // an edit-distance match is a correction
    const chiken = matchCommonFoods('chiken').find((c) => c.displayName === 'Chicken Breast')
    expect(chiken?.corrected).toBe(true)
    const avo = matchCommonFoods('avacado').find((c) => c.displayName === 'Avocado')
    expect(avo?.corrected).toBe(true)
  })

  it('returns nothing for sub-2-char or gibberish queries', () => {
    expect(matchCommonFoods('b')).toEqual([])
    expect(matchCommonFoods('zxqwk')).toEqual([])
  })

  it('respects the result limit', () => {
    expect(matchCommonFoods('a', { limit: 3 }).length).toBeLessThanOrEqual(3)
    expect(matchCommonFoods('chicken', { limit: 3 }).length).toBeLessThanOrEqual(3)
  })
})

describe('browse by type', () => {
  it('lists ordered categories', () => {
    expect(CATALOG_CATEGORIES.length).toBeGreaterThanOrEqual(10)
    expect(CATALOG_CATEGORIES).toContain('Fast food & restaurant')
  })

  it('returns foods for a category', () => {
    const fast = browseCategory('Fast food & restaurant')
    expect(fast.length).toBeGreaterThan(0)
    expect(fast.every((c) => c.category === 'Fast food & restaurant')).toBe(true)
  })
})

describe('portion size presets', () => {
  it('gives named presets for high-variance foods', () => {
    const fries = sizeOptionsFor({ displayName: 'French Fries', category: 'Fast food & restaurant', serving: { grams: 117, label: 'medium' } })
    expect(fries.map((s) => s.label)).toEqual(['Small', 'Medium', 'Large'])
  })

  it('falls back to generic half/serving/double', () => {
    const opts = sizeOptionsFor({ displayName: 'Banana', category: 'Fruits', serving: { grams: 118, label: '1 banana' } })
    expect(opts).toHaveLength(3)
    expect(opts[0]).toEqual({ label: 'Half', grams: 59 })
    expect(opts[2]).toEqual({ label: 'Double', grams: 236 })
  })
})

import {
  DRINK_CATALOG,
  DRINK_CATEGORIES,
  searchDrinks,
  drinksByCategory,
} from '@/lib/nutrition/drinkCatalog'

describe('drink catalog', () => {
  test('every category has at least one drink', () => {
    for (const c of DRINK_CATEGORIES) {
      expect(drinksByCategory(c.id).length).toBeGreaterThan(0)
    }
  })

  test('water is NOT a drink — it lives in the Water section (·04)', () => {
    expect(DRINK_CATALOG.find((d) => d.id === 'water')).toBeUndefined()
    expect(DRINK_CATEGORIES.find((c) => c.id === ('water' as never))).toBeUndefined()
  })

  test('every drink carries at least one real-world size with sane numbers', () => {
    for (const d of DRINK_CATALOG) {
      expect(d.sizes.length).toBeGreaterThan(0)
      for (const s of d.sizes) {
        expect(s.ml).toBeGreaterThan(0)
        expect(s.kcal).toBeGreaterThanOrEqual(0)
        expect(s.label.length).toBeGreaterThan(0)
      }
    }
  })

  test('branded drinks carry sizes (Coca-Cola → 330ml/139kcal can)', () => {
    const coke = DRINK_CATALOG.find((d) => d.id === 'coca-cola')!
    expect(coke.sizes[0].ml).toBe(330)
    expect(coke.sizes[0].kcal).toBe(139)
  })

  test('searchDrinks matches by name; empty query → []', () => {
    expect(searchDrinks('')).toEqual([])
    expect(searchDrinks('  ')).toEqual([])
    expect(searchDrinks('cola').some((d) => d.id === 'coca-cola')).toBe(true)
    expect(searchDrinks('OAT').some((d) => d.id === 'oat-milk')).toBe(true)
  })

  test('every drink id is unique and every drink belongs to a real category', () => {
    const ids = DRINK_CATALOG.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    const cats = new Set(DRINK_CATEGORIES.map((c) => c.id))
    for (const d of DRINK_CATALOG) expect(cats.has(d.category)).toBe(true)
  })
})

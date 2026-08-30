import { unitToGrams, gramsToUnit, rescaleByGrams, PORTION_UNITS } from '@/lib/nutrition/portions'

describe('portion units', () => {
  test('PORTION_UNITS lists g, oz, egg, tbsp, tsp, ml', () => {
    expect(PORTION_UNITS.map((u) => u.id)).toEqual(['g', 'oz', 'egg', 'tbsp', 'tsp', 'ml'])
  })
  test('unitToGrams converts each unit', () => {
    expect(unitToGrams(100, 'g')).toBe(100)
    expect(unitToGrams(1, 'oz')).toBeCloseTo(28.3495, 3)
    expect(unitToGrams(2, 'egg')).toBe(100)
    expect(unitToGrams(1, 'tbsp')).toBe(15)
    expect(unitToGrams(3, 'tsp')).toBe(15)
    expect(unitToGrams(250, 'ml')).toBe(250)
  })
  test('gramsToUnit is the inverse', () => {
    expect(gramsToUnit(100, 'g')).toBe(100)
    expect(gramsToUnit(100, 'egg')).toBe(2)
    expect(gramsToUnit(15, 'tbsp')).toBe(1)
  })
  test('rescaleByGrams scales macros proportionally', () => {
    const m = { kcal: 200, protein: 20, carbs: 10, fat: 8 }
    expect(rescaleByGrams(m, 100, 50)).toEqual({ kcal: 100, protein: 10, carbs: 5, fat: 4 })
  })
  test('rescaleByGrams guards a zero/invalid source (returns macros unchanged)', () => {
    const m = { kcal: 200, protein: 20, carbs: 10, fat: 8 }
    expect(rescaleByGrams(m, 0, 50)).toEqual(m)
  })
})

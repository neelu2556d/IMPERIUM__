import {
  isImplausibleKcal,
  selectPlausibleMatch,
  MAX_FOOD_KCAL_PER_100G,
  type UsdaFood,
} from '@/lib/nutrition/usda'

const food = (description: string, kcal: number, dataType = 'SR Legacy'): UsdaFood => ({
  description,
  dataType,
  foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: kcal }],
})

describe('isImplausibleKcal', () => {
  test('normal foods and high-fat foods are plausible', () => {
    expect(isImplausibleKcal(350)).toBe(false) // nachos
    expect(isImplausibleKcal(884)).toBe(false) // olive oil
    expect(isImplausibleKcal(MAX_FOOD_KCAL_PER_100G)).toBe(false) // pure fat, at the ceiling
  })
  test('zero is not "implausibly high" (water / black coffee are legit)', () => {
    expect(isImplausibleKcal(0)).toBe(false)
  })
  test('anything above the pure-fat ceiling is implausible', () => {
    expect(isImplausibleKcal(MAX_FOOD_KCAL_PER_100G + 1)).toBe(true)
    expect(isImplausibleKcal(2092)).toBe(true) // 500 kcal mislabeled as kJ-in-a-kcal-field
  })
})

describe('selectPlausibleMatch', () => {
  test('returns the rank winner when its energy density is plausible', () => {
    const ranked = [food('Nachos', 350), food('Cheese sauce', 250)]
    expect(selectPlausibleMatch(ranked, 'nachos')).toEqual({
      description: 'Nachos',
      per100: { kcal: 350, protein: 0, carbs: 0, fat: 0 },
    })
  })

  test('falls back to the best-ranked plausible candidate when the winner is impossible', () => {
    const ranked = [food('Mislabeled energy row', 2092), food('Real food', 320)]
    const match = selectPlausibleMatch(ranked, 'real food')
    expect(match?.description).toBe('Real food')
    expect(match?.per100.kcal).toBe(320)
  })

  test('returns null rather than poison totals when every candidate is impossible', () => {
    const ranked = [food('Bad A', 1500), food('Bad B', 3000)]
    expect(selectPlausibleMatch(ranked, 'whatever')).toBeNull()
  })

  test('a zero-kcal winner is still returned (no false-positive on legit-0 foods)', () => {
    const ranked = [food('Sparkling water', 0)]
    expect(selectPlausibleMatch(ranked, 'sparkling water')?.per100.kcal).toBe(0)
  })

  test('empty results → null', () => {
    expect(selectPlausibleMatch([], 'anything')).toBeNull()
  })
})

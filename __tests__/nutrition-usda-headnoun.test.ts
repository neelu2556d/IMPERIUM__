import { rankUsdaResults } from '@/lib/nutrition/usda'

// Equal base scores so the ranking is decided by the heuristic under test, not
// by USDA's relevance score. kcal is irrelevant to ranking but kept realistic.
const f = (description: string, dataType = 'SR Legacy', score = 250) => ({
  description,
  score,
  dataType,
  foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: 200 }],
})

const top = (foods: ReturnType<typeof f>[], q: string) =>
  rankUsdaResults(foods, q).map((x) => x.description)[0]

describe('rankUsdaResults — adjective-led queries rank the real food, not a dish', () => {
  test('"ground beef" → plain ground beef beats "Ground beef, fast food"', () => {
    const foods = [f('Ground beef, fast food', 'Survey (FNDDS)'), f('Beef, ground')]
    expect(top(foods, 'ground beef')).toBe('Beef, ground')
  })

  test('"smoked salmon" → the fish beats "Smoked salmon spread"', () => {
    const foods = [f('Smoked salmon spread'), f('Salmon, smoked (lox)')]
    expect(top(foods, 'smoked salmon')).toBe('Salmon, smoked (lox)')
  })

  test('"canned tuna" → drained tuna beats "Canned tuna salad"', () => {
    const foods = [f('Canned tuna salad'), f('Tuna, light, canned in water, drained')]
    expect(top(foods, 'canned tuna')).toBe('Tuna, light, canned in water, drained')
  })

  test('"grilled chicken" → the chicken beats "Grilled chicken salad"', () => {
    const foods = [f('Grilled chicken salad'), f('Chicken, broilers or fryers, breast, cooked, grilled')]
    expect(top(foods, 'grilled chicken')).toBe('Chicken, broilers or fryers, breast, cooked, grilled')
  })
})

describe('rankUsdaResults — no regression on non-modifier multi-word queries', () => {
  test('"peanut butter" still resolves to peanut butter, not dairy butter', () => {
    const foods = [f('Butter, salted'), f('Peanut butter, smooth style, with salt')]
    expect(top(foods, 'peanut butter')).toBe('Peanut butter, smooth style, with salt')
  })

  test('single-word "beef" still puts a plain "Beef, ..." entry on top', () => {
    const foods = [
      f('Beef, cured, corned beef, canned'),
      f('Beef, ground'),
      f('Bologna, beef'),
    ]
    expect(top(foods, 'beef')).toBe('Beef, ground')
  })
})

import { filterBasicResults } from '@/lib/nutrition/search'

const cand = (description: string, kcal: number) => ({ fdcId: Math.round(kcal + description.length), description, displayName: description, serving: { grams: 100, label: '100g' }, per100: { kcal, protein: 0, carbs: 0, fat: 0 } })

describe('filterBasicResults', () => {
  test('drops raw entries unless the query opts in', () => {
    const r = filterBasicResults([cand('Chicken, raw', 120), cand('Chicken, grilled', 165)], 'chicken')
    expect(r.map((c) => c.description)).toEqual(['Chicken, grilled'])
  })
  test('keeps raw entries when the query asks for raw/sushi', () => {
    const r = filterBasicResults([cand('Tuna, raw', 130)], 'sushi tuna')
    expect(r).toHaveLength(1)
  })
  test('drops zero-kcal entries', () => {
    const r = filterBasicResults([cand('Water', 0), cand('Rice, cooked', 130)], 'rice')
    expect(r.map((c) => c.description)).toEqual(['Rice, cooked'])
  })
})

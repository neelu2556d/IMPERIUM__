import { weightDelta, dayTotals } from '@/lib/nutrition/trend'

describe('weightDelta', () => {
  test('null with fewer than 2 entries', () => {
    expect(weightDelta([{ dayKey: '2026-05-30', kg: 80 }], '2026-05-30', 7)).toBeNull()
  })
  test('latest minus the entry closest to N days ago', () => {
    const w = [{ dayKey: '2026-05-30', kg: 79 }, { dayKey: '2026-05-23', kg: 81 }]
    expect(weightDelta(w, '2026-05-30', 7)).toBeCloseTo(-2, 5)
  })
})

describe('dayTotals', () => {
  test('sums kcal + protein for a day', () => {
    const meals = [
      { dayKey: '2026-05-30', totals: { kcal: 500, protein: 30, carbs: 0, fat: 0 } },
      { dayKey: '2026-05-30', totals: { kcal: 200, protein: 10, carbs: 0, fat: 0 } },
      { dayKey: '2026-05-29', totals: { kcal: 999, protein: 99, carbs: 0, fat: 0 } },
    ] as any
    expect(dayTotals(meals, '2026-05-30')).toEqual({ kcal: 700, protein: 40, carbs: 0, fat: 0 })
  })
})

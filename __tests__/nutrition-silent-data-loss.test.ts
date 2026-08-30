import { parseDrinkServingMl } from '@/lib/nutrition/macros'
import { mealToRow, rowToMeal, type MealRow } from '@/app/app/fuel/macros/serialize'

describe('parseDrinkServingMl — a custom drink needs a real serving size', () => {
  test('valid servings parse to integer ml', () => {
    expect(parseDrinkServingMl('330')).toBe(330)
    expect(parseDrinkServingMl('250')).toBe(250)
    expect(parseDrinkServingMl('12.5')).toBe(13)
  })

  test('blank / zero / negative / non-numeric → null (Save must be gated off)', () => {
    expect(parseDrinkServingMl('')).toBeNull()
    expect(parseDrinkServingMl('0')).toBeNull()
    expect(parseDrinkServingMl('-5')).toBeNull()
    expect(parseDrinkServingMl('abc')).toBeNull()
  })
})

describe('meal note clear persists (the contract setMealNote relies on)', () => {
  const baseRow: MealRow = {
    id: 'm1', day_key: '2026-06-20', logged_at: '2026-06-20T00:00:00Z',
    state: 'confident', what_i_see: 'Lunch', meal_type: 'lunch', notes: 'old note',
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, foods: [], unmatched: [],
    questions: [], thumbnail: null, source: null, source_ref: null,
  }

  test('an emptied note is INCLUDED in the update row (not skipped), so the DB clears it', () => {
    const row = mealToRow({ notes: '' })
    expect('notes' in row).toBe(true)
    expect(row.notes === '' || row.notes === null).toBe(true)
  })

  test('a non-empty note is written through', () => {
    expect(mealToRow({ notes: 'hello' }).notes).toBe('hello')
  })

  test('a cleared note round-trips back to undefined (no stale note shown)', () => {
    const cleared = rowToMeal({ ...baseRow, notes: '' })
    expect(cleared.notes).toBeUndefined()
  })
})

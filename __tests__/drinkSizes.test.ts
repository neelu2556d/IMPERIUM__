import {
  DRINK_SIZES,
  HYDRATION_GOAL_ML,
  mlToOz,
  scaleDrinkToMl,
  QUICK_DRINKS,
  type QuickDrink,
} from '@/lib/nutrition/macros'
import { buildDrinkMeal } from '@/app/app/fuel/macros/build'

const water = QUICK_DRINKS.find((d) => d.id === 'water')!
const milk = QUICK_DRINKS.find((d) => d.id === 'milk')! // grams 245, kcal 122

describe('drink size presets', () => {
  it('has six ascending-volume vessels each with a real-world anchor', () => {
    expect(DRINK_SIZES).toHaveLength(6)
    const mls = DRINK_SIZES.map((s) => s.ml)
    expect(mls).toEqual([...mls].sort((a, b) => a - b)) // ascending
    expect(new Set(mls).size).toBe(6) // distinct
    for (const s of DRINK_SIZES) {
      expect(s.anchor.trim().length).toBeGreaterThan(0)
      expect(s.ml).toBeGreaterThan(0)
    }
  })

  it('goal is 2.5 L', () => {
    expect(HYDRATION_GOAL_ML).toBe(2500)
  })
})

describe('mlToOz', () => {
  it('converts ml to fluid oz, rounded to .1', () => {
    expect(mlToOz(250)).toBe(8.5)
    expect(mlToOz(330)).toBe(11.2)
    expect(mlToOz(500)).toBe(16.9)
    expect(mlToOz(0)).toBe(0)
  })
})

describe('scaleDrinkToMl', () => {
  it('keeps water at zero macros at any size', () => {
    const { grams, macros } = scaleDrinkToMl(water, 600)
    expect(grams).toBe(600)
    expect(macros).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('scales caloric drinks linearly by chosen volume', () => {
    // milk: 122 kcal / 245 g  →  at 250 ml ≈ 124.5 kcal
    const { grams, macros } = scaleDrinkToMl(milk, 250)
    expect(grams).toBe(250)
    expect(macros.kcal).toBeCloseTo((122 / 245) * 250, 5)
    expect(macros.protein).toBeCloseTo((8 / 245) * 250, 5)
  })

  it('scaling down halves macros', () => {
    const half = scaleDrinkToMl(milk, milk.grams / 2)
    expect(half.macros.kcal).toBeCloseTo(milk.macros.kcal / 2, 5)
  })

  it('does not divide by zero for a zero-gram preset', () => {
    const odd: QuickDrink = { id: 'x', name: 'X', grams: 0, macros: { kcal: 10, protein: 0, carbs: 0, fat: 0 } }
    const out = scaleDrinkToMl(odd, 200)
    expect(out.grams).toBe(200)
    expect(Number.isFinite(out.macros.kcal)).toBe(true)
  })
})

describe('buildDrinkMeal with a chosen size', () => {
  it('logs the scaled macros + grams for the picked ml and notes the size', () => {
    const meal = buildDrinkMeal(milk, '2026-06-20', 500)
    expect(meal.foods[0].grams).toBe(500)
    expect(meal.totals.kcal).toBeCloseTo((122 / 245) * 500, 5)
    expect(meal.whatISee).toContain('500 ml')
    expect(meal.source).toBe('drink')
    expect(meal.mealType).toBe('snack')
  })

  it('falls back to the preset default volume when ml is omitted (back-compat)', () => {
    const meal = buildDrinkMeal(milk, '2026-06-20')
    expect(meal.foods[0].grams).toBe(milk.grams)
    expect(meal.totals.kcal).toBeCloseTo(milk.macros.kcal, 5)
    expect(meal.whatISee).not.toContain('ml,') // no size note appended
  })
})

import { classifyFood, dayFoodQuality, flaggedAllergens } from '@/lib/nutrition/foodQuality'
import type { MealFood } from '@/lib/nutrition/types'

function food(name: string, grams: number, usdaDescription = ''): MealFood {
  return { id: null, name, grams, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription }
}

describe('classifyFood', () => {
  it('classifies whole, processed, and unknown', () => {
    expect(classifyFood({ name: 'grilled chicken breast' })).toBe('whole')
    expect(classifyFood({ name: 'broccoli' })).toBe('whole')
    expect(classifyFood({ name: 'french fries' })).toBe('processed')
    expect(classifyFood({ name: 'pepperoni pizza' })).toBe('processed')
    // processed wins over whole when both hit
    expect(classifyFood({ name: 'fried chicken' })).toBe('processed')
    // unknown text is neutral, never punished
    expect(classifyFood({ name: 'lunch' })).toBe('neutral')
    expect(classifyFood({ name: '' })).toBe('neutral')
  })
})

describe('dayFoodQuality', () => {
  it('a whole-food day scores a high wholeRatio', () => {
    const q = dayFoodQuality([food('eggs', 150), food('chicken breast', 200), food('broccoli', 150)])
    expect(q.wholeRatio).toBeGreaterThan(0.85)
    expect(q.topWholeFoods.length).toBeGreaterThan(0)
  })

  it('a fast-food day surfaces processed share and a lower wholeRatio', () => {
    const q = dayFoodQuality([food('french fries', 200), food('cheeseburger', 250), food('soda', 300)])
    expect(q.processedShare).toBeGreaterThan(0.8)
    expect(q.wholeRatio).toBeLessThan(0.2)
  })

  it('missing-detail food is neutral-positive, never zero', () => {
    const q = dayFoodQuality([food('lunch', 400), food('dinner', 500)])
    expect(q.wholeRatio).toBeCloseTo(0.6, 5)
    expect(q.microsScore).toBeGreaterThanOrEqual(0.4)
  })

  it('an empty day returns calm defaults, never zero', () => {
    const q = dayFoodQuality([])
    expect(q.wholeRatio).toBe(0.6)
    expect(q.microsScore).toBe(0.5)
  })

  it('produce lifts the micros proxy', () => {
    const veg = dayFoodQuality([food('spinach salad', 200), food('apple', 150)])
    const none = dayFoodQuality([food('white bread', 200)])
    expect(veg.microsScore).toBeGreaterThan(none.microsScore)
  })

  it('surfaces sugar share + names for the cut_sugar coach', () => {
    const q = dayFoodQuality([food('chicken breast', 200), food('chocolate cookie', 60), food('cola', 330)])
    expect(q.sugarShare).toBeGreaterThan(0)
    expect(q.topSugaryFoods).toEqual(expect.arrayContaining(['chocolate cookie', 'cola']))
  })

  it('surfaces fast-food share + names for the quit_fastfood coach', () => {
    const q = dayFoodQuality([food('McDonald’s cheeseburger', 250), food('side salad', 100)])
    expect(q.fastFoodShare).toBeGreaterThan(0)
    expect(q.topFastFoods.length).toBeGreaterThan(0)
  })

  it('a whole-food day has zero sugar/fast-food share', () => {
    const q = dayFoodQuality([food('eggs', 150), food('chicken breast', 200), food('broccoli', 150)])
    expect(q.sugarShare).toBe(0)
    expect(q.fastFoodShare).toBe(0)
  })
})

describe('flaggedAllergens', () => {
  it('flags a logged food that matches an allergen the user avoids', () => {
    const flags = flaggedAllergens([food('peanut butter toast', 60)], ['peanut'])
    expect(flags).toHaveLength(1)
    expect(flags[0].restriction).toBe('peanut')
    expect(flags[0].kind).toBe('allergen')
    expect(flags[0].label).toBe('peanuts')
    expect(flags[0].food).toBe('peanut butter toast')
  })

  it('phrases a diet conflict as "may not be <diet>", not "may contain"', () => {
    const flags = flaggedAllergens([food('scrambled eggs', 120)], ['vegan'])
    expect(flags).toHaveLength(1)
    expect(flags[0].kind).toBe('diet')
    expect(flags[0].label).toBe('vegan')
  })

  it('flags dairy for a lactose restriction and meat for a vegetarian', () => {
    expect(flaggedAllergens([food('cheddar cheese', 40)], ['lactose'])).toHaveLength(1)
    expect(flaggedAllergens([food('grilled chicken', 200)], ['vegetarian'])).toHaveLength(1)
  })

  it('returns nothing when the user has no restrictions or only none', () => {
    expect(flaggedAllergens([food('shrimp scampi', 200)], [])).toEqual([])
    expect(flaggedAllergens([food('shrimp scampi', 200)], ['none'])).toEqual([])
  })

  it('does not flag a safe food', () => {
    expect(flaggedAllergens([food('grilled chicken', 200), food('rice', 150)], ['peanut', 'shellfish'])).toEqual([])
  })

  it('gives at most one flag per food (does not pile restrictions on)', () => {
    // "cheese and chicken wrap" trips both lactose (cheese) and vegetarian
    // (chicken); the user should see one line, not two.
    const flags = flaggedAllergens([food('cheese and chicken wrap', 250)], ['lactose', 'vegetarian'])
    expect(flags).toHaveLength(1)
  })

  it('does not over-flag compound words (eggplant, hamburger, peanut butter)', () => {
    // word-boundary + plural matching: these must NOT trip the wrong restriction.
    expect(flaggedAllergens([food('grilled eggplant', 150)], ['egg', 'vegan'])).toEqual([])
    expect(flaggedAllergens([food('peanut butter on toast', 40)], ['lactose'])).toEqual([])
    expect(flaggedAllergens([food('honeydew melon', 150)], ['vegan'])).toEqual([])
    // but a real plural still flags
    expect(flaggedAllergens([food('scrambled eggs', 120)], ['vegan'])).toHaveLength(1)
    expect(flaggedAllergens([food('roasted peanuts', 40)], ['peanut'])).toHaveLength(1)
  })
})

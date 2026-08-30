import { scoreDay, scoreMeal, dayPhase } from '@/lib/nutrition/coachScore'
import { dayFoodQuality } from '@/lib/nutrition/foodQuality'
import type { GoalMode } from '@/lib/nutrition/goalContext'
import type { MealFood } from '@/lib/nutrition/types'

const QUALITY = dayFoodQuality([
  { id: null, name: 'chicken', grams: 200, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription: '' },
  { id: null, name: 'rice', grams: 200, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription: '' },
])

function dayFor(mode: GoalMode, totals: { kcal: number; protein: number; carbs?: number; fat?: number }, f = 1) {
  return scoreDay({ totals, target: { kcal: 2200, protein: 160 }, fractionElapsed: f, quality: QUALITY, mode })
}

describe('scoreDay invariants', () => {
  it('rows always sum to the score, no row exceeds its max, no red tone, 0..10', () => {
    const cases: Array<{ mode: GoalMode; totals: { kcal: number; protein: number; carbs?: number; fat?: number }; f: number }> = [
      { mode: 'lose', totals: { kcal: 2800, protein: 180, carbs: 280, fat: 90 }, f: 1 },
      { mode: 'build', totals: { kcal: 1600, protein: 90, carbs: 180, fat: 50 }, f: 0.5 },
      { mode: 'balanced', totals: { kcal: 2200, protein: 160, carbs: 220, fat: 70 }, f: 1 },
      { mode: 'lose', totals: { kcal: 500, protein: 40, carbs: 50, fat: 15 }, f: 0.25 },
    ]
    for (const c of cases) {
      const r = dayFor(c.mode, c.totals, c.f)!
      expect(r).not.toBeNull()
      const sum = r.rows.reduce((s, row) => s + row.earned, 0)
      expect(sum).toBe(r.score)
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(10)
      for (const row of r.rows) {
        expect(row.earned).toBeLessThanOrEqual(row.max)
        expect(row.earned).toBeGreaterThanOrEqual(0)
        expect(['good', 'watch']).toContain(row.tone) // never red
      }
    }
  })

  it('build and lose are felt: the same overfed high-protein day scores differently', () => {
    const overfed = { kcal: 3200, protein: 190, carbs: 320, fat: 100 }
    const build = dayFor('build', overfed)!
    const lose = dayFor('lose', overfed)!
    expect(build.score).not.toBe(lose.score)
    // an overfed but protein-strong day is graded more kindly when building
    expect(build.score).toBeGreaterThan(lose.score)
  })

  it('returns null with no food or no target', () => {
    expect(scoreDay({ totals: { kcal: 0, protein: 0 }, target: { kcal: 2200, protein: 160 }, fractionElapsed: 1, quality: QUALITY, mode: 'lose' })).toBeNull()
    expect(scoreDay({ totals: { kcal: 1800, protein: 140 }, target: { kcal: 0, protein: 0 }, fractionElapsed: 1, quality: QUALITY, mode: 'lose' })).toBeNull()
  })

  it('is deterministic and re-runnable for a fixed input', () => {
    const a = dayFor('balanced', { kcal: 2000, protein: 150, carbs: 200, fat: 70 })!
    const b = dayFor('balanced', { kcal: 2000, protein: 150, carbs: 200, fat: 70 })!
    expect(a.score).toBe(b.score)
    expect(a.rows.map((r) => r.earned)).toEqual(b.rows.map((r) => r.earned))
  })
})

describe('scoreMeal', () => {
  const foods: MealFood[] = [
    { id: null, name: 'chicken', grams: 200, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription: '' },
  ]
  it('returns 0..10 and null with no calories', () => {
    const r = scoreMeal({ totals: { kcal: 600, protein: 50, carbs: 40, fat: 18 }, foods }, { mode: 'build' })!
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(10)
    expect(scoreMeal({ totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, foods }, { mode: 'build' })).toBeNull()
  })

  it('a lean protein meal beats a greasy carb-light meal', () => {
    const lean = scoreMeal({ totals: { kcal: 500, protein: 55, carbs: 40, fat: 12 }, foods: [{ id: null, name: 'grilled chicken', grams: 200, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription: '' }] }, { mode: 'lose' })!
    const greasy = scoreMeal({ totals: { kcal: 800, protein: 18, carbs: 30, fat: 60 }, foods: [{ id: null, name: 'french fries', grams: 250, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, hintUsed: null, usdaDescription: '' }] }, { mode: 'lose' })!
    expect(lean.score).toBeGreaterThan(greasy.score)
  })
})

describe('time-aware coach (the day clock)', () => {
  const target = { kcal: 2200, protein: 160 }
  // a real, healthy breakfast: eggs + fruit, modest totals
  const breakfast = { kcal: 400, protein: 25, carbs: 40, fat: 15 }

  it('dayPhase is total + clamped: every input maps to a valid phase', () => {
    expect(dayPhase(0)).toBe('morning')
    expect(dayPhase(0.2)).toBe('morning')
    expect(dayPhase(0.5)).toBe('midday')
    expect(dayPhase(0.9)).toBe('evening')
    expect(dayPhase(1)).toBe('evening')
    // out of range / broken clock never throws, never invalid
    expect(['morning', 'midday', 'evening']).toContain(dayPhase(-5))
    expect(['morning', 'midday', 'evening']).toContain(dayPhase(99))
    expect(['morning', 'midday', 'evening']).toContain(dayPhase(NaN))
    expect(['morning', 'midday', 'evening']).toContain(dayPhase(Infinity))
  })

  it('a healthy breakfast in the morning scores well and is never framed as a gap', () => {
    const r = scoreDay({ totals: breakfast, target, fractionElapsed: 0.1, quality: QUALITY, mode: 'lose' })!
    expect(r.score).toBeGreaterThanOrEqual(7) // morning grace: not punished for low totals
    expect(r.headline.toLowerCase()).not.toContain('gap')
    expect(r.headline.toLowerCase()).toContain('day left')
  })

  it('the same breakfast is stricter (a real gap) by the evening', () => {
    const morning = scoreDay({ totals: breakfast, target, fractionElapsed: 0.1, quality: QUALITY, mode: 'lose' })!
    const evening = scoreDay({ totals: breakfast, target, fractionElapsed: 1, quality: QUALITY, mode: 'lose' })!
    expect(evening.score).toBeLessThan(morning.score)
  })

  it('morning eating is never penalized for being "over pace" (breakfast > tiny early expectation)', () => {
    // 168 kcal at the very start of the day used to count as "over pace" and lose points.
    const r = scoreDay({ totals: { kcal: 168, protein: 14, carbs: 5, fat: 10 }, target, fractionElapsed: 0, quality: QUALITY, mode: 'lose' })!
    const cals = r.rows.find((x) => x.key === 'calories')!
    expect(cals.reason.toLowerCase()).not.toContain('over')
  })

  it('an invalid clock still yields a valid 0..10 score, never NaN', () => {
    const r = scoreDay({ totals: breakfast, target, fractionElapsed: NaN, quality: QUALITY, mode: 'balanced' })!
    expect(r).not.toBeNull()
    expect(Number.isFinite(r.score)).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(10)
  })

  it('going over the FULL day budget is still flagged (over is real, any time)', () => {
    const r = scoreDay({ totals: { kcal: 3200, protein: 160, carbs: 320, fat: 110 }, target, fractionElapsed: 0.5, quality: QUALITY, mode: 'lose' })!
    const cals = r.rows.find((x) => x.key === 'calories')!
    expect(cals.reason.toLowerCase()).toContain('over')
  })
})

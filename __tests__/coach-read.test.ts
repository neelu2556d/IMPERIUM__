import { coachRead, eatingDayFraction } from '@/lib/nutrition/coachRead'

describe('eatingDayFraction', () => {
  const at = (h: number, m = 0) => {
    const d = new Date(2026, 5, 21, h, m, 0)
    return eatingDayFraction(d)
  }
  it('is 0 in the fresh-morning pre-breakfast window (4am-8am)', () => {
    expect(at(6)).toBe(0)
  })
  it('ramps through the day (noon is partway)', () => {
    const noon = at(12)
    expect(noon).toBeGreaterThan(0.2)
    expect(noon).toBeLessThan(0.45)
  })
  it('is 1 once the eating day is over (>=9pm)', () => {
    expect(at(21)).toBe(1)
    expect(at(23)).toBe(1)
  })
  it('treats the small hours (after midnight, before 4am) as the done tail of the day', () => {
    expect(at(1)).toBe(1)
  })
})

describe('coachRead — strict (end of day, fraction 1)', () => {
  it('returns null when nothing was logged', () => {
    expect(coachRead({ kcal: 0, protein: 0 }, { kcal: 2200, protein: 160 }, 1)).toBeNull()
  })

  it('returns null when there is no calorie target to grade against', () => {
    expect(coachRead({ kcal: 1800, protein: 140 }, { kcal: 0, protein: 0 }, 1)).toBeNull()
  })

  it('gives a top score and a repeat-this-day read for a near-perfect day', () => {
    const r = coachRead({ kcal: 2200, protein: 165 }, { kcal: 2200, protein: 160 }, 1)
    expect(r!.score).toBeGreaterThanOrEqual(9)
    expect(r!.reason).toMatch(/repeat/i)
  })

  it('scores a light end-of-day total low, but frames it warmly (never shame)', () => {
    const r = coachRead({ kcal: 520, protein: 52 }, { kcal: 3047, protein: 180 }, 1)
    expect(r!.score).toBeLessThanOrEqual(3)
    expect(r!.reason).toMatch(/light day|tomorrow/i)
    expect(r!.reason.toLowerCase()).not.toMatch(/fail|bad|shame|red/)
  })

  it('always clamps the score into 0-10', () => {
    const r = coachRead({ kcal: 9000, protein: 0 }, { kcal: 2200, protein: 160 }, 1)
    expect(r!.score).toBeGreaterThanOrEqual(0)
    expect(r!.score).toBeLessThanOrEqual(10)
  })
})

describe('coachRead — pace-aware (mid-day)', () => {
  // The canonical case: 520 kcal / 52g protein on a 3047 / 180 bulk target.
  const totals = { kcal: 520, protein: 52 }
  const target = { kcal: 3047, protein: 180 }

  it('reads the same light total as ON PACE at noon, not a 2', () => {
    const noon = eatingDayFraction(new Date(2026, 5, 21, 12, 0, 0))
    const r = coachRead(totals, target, noon)
    // protein is essentially on its noon pace (52 vs ~54 expected) → solid score
    expect(r!.score).toBeGreaterThanOrEqual(6)
    expect(r!.reason.toLowerCase()).toMatch(/pace|tracking|behind for this time/)
  })

  it('reads the SAME total as a genuine light day at midnight', () => {
    const r = coachRead(totals, target, 1)
    expect(r!.score).toBeLessThanOrEqual(3)
  })

  it('never punishes simply not having eaten much early on', () => {
    const breakfastOnly = { kcal: 350, protein: 30 }
    const nineAm = eatingDayFraction(new Date(2026, 5, 21, 9, 0, 0))
    const r = coachRead(breakfastOnly, target, nineAm)
    expect(r!.score).toBeGreaterThanOrEqual(5)
  })
})

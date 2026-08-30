import { dailyFoodScore, foodScoreTone } from '@/lib/nutrition/dayScore'

const T = { kcal: 2000, protein: 150 }

describe('dailyFoodScore', () => {
  test('on target for both → 10', () => {
    expect(dailyFoodScore({ kcal: 2000, protein: 150 }, T)).toBe(10)
  })

  test('nothing logged → null', () => {
    expect(dailyFoodScore({ kcal: 0, protein: 0 }, T)).toBeNull()
  })

  test('no target → null', () => {
    expect(dailyFoodScore({ kcal: 1800, protein: 140 }, { kcal: 0, protein: 0 })).toBeNull()
  })

  test('protein hit but calories 50% over → mid score', () => {
    // proteinPts 5 + caloriePts 5*(1-0.5)=2.5 → 7.5 → 8
    expect(dailyFoodScore({ kcal: 3000, protein: 150 }, T)).toBe(8)
  })

  test('calories on target but zero protein → 5', () => {
    expect(dailyFoodScore({ kcal: 2000, protein: 0 }, T)).toBe(5)
  })

  test('way over on calories with low protein → low score', () => {
    expect(dailyFoodScore({ kcal: 5000, protein: 30 }, T)).toBeLessThanOrEqual(2)
  })

  test('over-protein does not exceed its cap', () => {
    expect(dailyFoodScore({ kcal: 2000, protein: 400 }, T)).toBe(10)
  })

  test('tone buckets (mint / neutral / amber — never red)', () => {
    expect(foodScoreTone(9)).toBe('good')
    expect(foodScoreTone(6)).toBe('ok')
    expect(foodScoreTone(3)).toBe('low')
  })
})

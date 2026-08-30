import { buildBarcodeMeal } from '@/app/app/fuel/macros/build'
import type { OffMatch } from '@/lib/nutrition/types'

const baseMatch: OffMatch = {
  name: 'Test Bar',
  code: '5901234123457',
  thumbnail: null,
  per100: { kcal: 100, protein: 10, carbs: 50, fat: 5 },
}

describe('buildBarcodeMeal', () => {
  test('scales macros proportionally to grams', () => {
    const result = buildBarcodeMeal(baseMatch, 200, '2026-05-31')
    expect(result.totals.kcal).toBe(200)
    expect(result.totals.protein).toBe(20)
    expect(result.totals.carbs).toBe(100)
    expect(result.totals.fat).toBe(10)
  })

  test('sets source to "barcode"', () => {
    const result = buildBarcodeMeal(baseMatch, 100, '2026-05-31')
    expect(result.source).toBe('barcode')
  })

  test('preserves food name from OffMatch', () => {
    const result = buildBarcodeMeal(baseMatch, 100, '2026-05-31')
    expect(result.foods[0].name).toBe('Test Bar')
    expect(result.foods[0].grams).toBe(100)
  })

  test('falls back to "Scanned product" when name is empty', () => {
    const match: OffMatch = { ...baseMatch, name: '' }
    const result = buildBarcodeMeal(match, 100, '2026-05-31')
    expect(result.foods[0].name).toBe('Scanned product')
  })

  test('sets sourceRef to barcode code', () => {
    const result = buildBarcodeMeal(baseMatch, 100, '2026-05-31')
    expect(result.sourceRef).toBe('5901234123457')
  })

  test('passes through thumbnail', () => {
    const match: OffMatch = { ...baseMatch, thumbnail: 'https://example.com/img.jpg' }
    const result = buildBarcodeMeal(match, 100, '2026-05-31')
    expect(result.thumbnail).toBe('https://example.com/img.jpg')
  })

  test('thumbnail null when match.thumbnail is null', () => {
    const result = buildBarcodeMeal(baseMatch, 100, '2026-05-31')
    expect(result.thumbnail).toBeNull()
  })

  test('sourceRef is null and hintUsed is barcode when code is null', () => {
    const match: OffMatch = { ...baseMatch, code: null }
    const result = buildBarcodeMeal(match, 100, '2026-05-31')
    expect(result.sourceRef).toBeNull()
    expect(result.foods[0].hintUsed).toBe('barcode')
  })
})

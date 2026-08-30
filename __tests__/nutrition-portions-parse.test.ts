import { portionStrToGrams } from '@/lib/nutrition/portions'

describe('portionStrToGrams — never returns a zero/negative portion for invalid input', () => {
  test('a valid amount converts to grams', () => {
    expect(portionStrToGrams('100', 'g')).toBe(100)
    expect(portionStrToGrams('  100  ', 'g')).toBe(100) // Number() trims
  })

  test('unit conversion is applied', () => {
    expect(portionStrToGrams('2', 'egg')).toBe(100) // 1 egg = 50 g
    expect(portionStrToGrams('1', 'oz')).toBeCloseTo(28.3495, 3)
  })

  test('empty / blank / non-numeric → 0 (Save must be gated off)', () => {
    expect(portionStrToGrams('', 'g')).toBe(0)
    expect(portionStrToGrams('   ', 'g')).toBe(0)
    expect(portionStrToGrams('abc', 'g')).toBe(0)
  })

  test('zero and negative → 0, never a negative portion', () => {
    expect(portionStrToGrams('0', 'g')).toBe(0)
    expect(portionStrToGrams('-50', 'g')).toBe(0)
    expect(portionStrToGrams('-1', 'oz')).toBe(0)
  })

  test('Infinity / garbage → 0', () => {
    expect(portionStrToGrams('Infinity', 'g')).toBe(0)
    expect(portionStrToGrams('1e9999', 'g')).toBe(0)
  })
})

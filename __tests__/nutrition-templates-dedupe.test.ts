import { dedupeTemplates, templateContentKey } from '@/lib/nutrition/macros'
import type { MealTemplate } from '@/lib/nutrition/types'

function tpl(over: Partial<MealTemplate>): MealTemplate {
  return {
    id: 'id',
    name: 'Breakfast plate',
    foods: [],
    totals: { kcal: 500, protein: 30, carbs: 50, fat: 20 },
    thumbnail: null,
    mealType: 'breakfast',
    createdAt: '2026-06-20T00:00:00.000Z',
    ...over,
  } as MealTemplate
}

describe('templateContentKey', () => {
  test('same name + totals + mealType share a key regardless of id/case/whitespace', () => {
    const a = tpl({ id: 'a', name: 'Breakfast plate' })
    const b = tpl({ id: 'b', name: '  breakfast PLATE ' })
    expect(templateContentKey(a)).toBe(templateContentKey(b))
  })

  test('different totals → different key (distinct meals that share a name)', () => {
    const a = tpl({ id: 'a', name: 'Lunch', totals: { kcal: 500, protein: 30, carbs: 50, fat: 20 } })
    const b = tpl({ id: 'b', name: 'Lunch', totals: { kcal: 900, protein: 60, carbs: 80, fat: 30 } })
    expect(templateContentKey(a)).not.toBe(templateContentKey(b))
  })
})

describe('dedupeTemplates', () => {
  test('collapses identical favorites to one, keeping the first (newest)', () => {
    const list = [
      tpl({ id: 'newest' }),
      tpl({ id: 'middle' }),
      tpl({ id: 'oldest' }),
    ]
    const out = dedupeTemplates(list)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('newest')
  })

  test('keeps genuinely different favorites that happen to share a name', () => {
    const list = [
      tpl({ id: 'a', name: 'Lunch', totals: { kcal: 500, protein: 30, carbs: 50, fat: 20 } }),
      tpl({ id: 'b', name: 'Lunch', totals: { kcal: 900, protein: 60, carbs: 80, fat: 30 } }),
    ]
    expect(dedupeTemplates(list)).toHaveLength(2)
  })

  test('preserves order of the surviving favorites', () => {
    const list = [
      tpl({ id: 'a', name: 'A' }),
      tpl({ id: 'b', name: 'B' }),
      tpl({ id: 'a2', name: 'A' }), // dup of A, should drop
      tpl({ id: 'c', name: 'C' }),
    ]
    expect(dedupeTemplates(list).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  test('handles empty and single-item lists', () => {
    expect(dedupeTemplates([])).toEqual([])
    const one = [tpl({ id: 'only' })]
    expect(dedupeTemplates(one)).toHaveLength(1)
  })
})

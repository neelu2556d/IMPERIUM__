import { collectNutritionQuiz, collectCoachMemory } from '@/lib/coach/collectors'
import type { NutritionPreferences } from '@/lib/preferences'

const base: NutritionPreferences = {
  fix: ['energy', 'muscle'], skin: ['acne'], gut: 'often',
  restrictions: ['lactose', 'peanut'], avoid_notes: 'onions',
  adventurous: 'simple', approach: 'feel_first', pace: 'gentle',
  completed_at: '2026-06-03T00:00:00Z',
}

test('collectNutritionQuiz returns null when absent', () => {
  expect(collectNutritionQuiz(undefined)).toBeNull()
})

test('collectNutritionQuiz lists restrictions and honors feel_first', () => {
  const out = collectNutritionQuiz(base)!
  expect(out).toContain('lactose')
  expect(out).toContain('peanut')
  expect(out.toLowerCase()).toContain('never')   // never-suggest restriction instruction
  expect(out.toLowerCase()).toContain('calorie') // feel_first: no-calorie instruction
})

test('collectNutritionQuiz reflects pace in the push tone', () => {
  const driven = collectNutritionQuiz({ ...base, pace: 'driven', approach: 'balanced' })!
  expect(driven.toLowerCase()).toContain('push')
})

test('collectCoachMemory returns null when empty, fragment when present', () => {
  expect(collectCoachMemory(null)).toBeNull()
  expect(collectCoachMemory({ summary: '', message_count: 0, updated_at: '' })).toBeNull()
  const f = collectCoachMemory({ summary: 'Trains for summer. Dairy breaks them out.', message_count: 12, updated_at: '' })!
  expect(f).toContain('summer')
})

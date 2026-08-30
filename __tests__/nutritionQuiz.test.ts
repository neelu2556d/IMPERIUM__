import { getQuiz } from '@/lib/quizzes/registry'
import type { NutritionPreferences } from '@/lib/preferences'

const m = getQuiz('nutrition')

// `fix` is sourced solely from the fix_feel screen since the duplicated
// body-goal screen was retired (commit 448994c / #35) — fix_goals no longer
// exists in the food-story quiz, so toPayload doesn't read it.
test('toPayload takes fix from the feel screen and dedupes restrictions', () => {
  const payload = m.toPayload({
    fix_feel: ['energy', 'sleep'],
    skin: ['acne'],
    gut: 'often',
    restrict_allergens: ['lactose'],
    restrict_diet: ['vegan'],
    avoid_notes: 'onions',
    approach: 'feel_first',
    adventurous: 'simple',
    pace: 'gentle',
  }) as Omit<NutritionPreferences, 'completed_at'>
  expect([...payload.fix].sort()).toEqual(['energy', 'sleep'])
  expect([...payload.restrictions].sort()).toEqual(['lactose', 'vegan'])
  expect(payload.approach).toBe('feel_first')
  expect(payload.pace).toBe('gentle')
})

test('none normalization drops none when a real value is present', () => {
  const p = m.toPayload({
    fix_feel: [], fix_goals: [], skin: ['none', 'acne'], gut: 'fine',
    restrict_allergens: ['none', 'egg'], restrict_diet: ['none'],
    avoid_notes: '', approach: 'balanced', adventurous: 'high', pace: 'driven',
  }) as Omit<NutritionPreferences, 'completed_at'>
  expect(p.skin).toEqual(['acne'])
  expect(p.restrictions).toEqual(['egg'])
})

test('lone none stays none', () => {
  const p = m.toPayload({
    fix_feel: ['energy'], fix_goals: [], skin: ['none'], gut: 'fine',
    restrict_allergens: ['none'], restrict_diet: ['none'],
    avoid_notes: '', approach: 'balanced', adventurous: 'high', pace: 'driven',
  }) as Omit<NutritionPreferences, 'completed_at'>
  expect(p.skin).toEqual(['none'])
  expect(p.restrictions).toEqual(['none'])
})

test('fromPayload(toPayload(x)) round-trips the screen answers', () => {
  const answers = {
    fix_feel: ['focus'], skin: ['redness'],
    gut: 'sometimes', restrict_allergens: ['peanut', 'sesame'], restrict_diet: ['halal'],
    avoid_notes: 'fried food', approach: 'balanced', adventurous: 'routine', pace: 'balanced',
  }
  const back = m.fromPayload(m.toPayload(answers) as NutritionPreferences)
  expect((back.fix_feel as string[]).sort()).toEqual(['focus'])
  expect((back.restrict_allergens as string[]).sort()).toEqual(['peanut', 'sesame'])
  expect((back.restrict_diet as string[]).sort()).toEqual(['halal'])
})

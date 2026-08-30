import {
  pendingKey,
  countLoggedSets,
  shouldRecoverFromPending,
} from '@/lib/workouts/pendingSnapshot'
import type { SavedExercise, CardioEntry } from '@/lib/workouts/queries'

function ex(id: string, sets: Array<{ w: number | null; r: number | null; done?: boolean; failed?: boolean }>): SavedExercise {
  return {
    id,
    name: id,
    targetSets: sets.length,
    targetReps: 10,
    sets: sets.map(s => ({ weight: s.w, reps: s.r, done: s.done ?? false, failed: s.failed ?? false })),
  }
}

describe('pendingSnapshot helpers', () => {
  test('pendingKey is scoped to user, date and day', () => {
    expect(pendingKey('u1', '2026-06-17', 'Pull')).toBe('vitality_pending_workout:u1:2026-06-17:Pull')
    expect(pendingKey('u1', '2026-06-17', 'Pull')).not.toBe(pendingKey('u2', '2026-06-17', 'Pull'))
    expect(pendingKey('u1', '2026-06-17', 'Pull')).not.toBe(pendingKey('u1', '2026-06-18', 'Pull'))
  })

  test('countLoggedSets counts only done, non-failed sets with real weight + reps', () => {
    const exercises = [
      ex('a', [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }, { w: null, r: null }]),
      ex('b', [{ w: 40, r: 8, done: true, failed: true }, { w: 0, r: 10, done: true }]),
    ]
    expect(countLoggedSets(exercises)).toBe(2)
  })

  test('recovers when the backup holds more logged sets than the server', () => {
    const server = { exercises: [ex('a', [{ w: 60, r: 10, done: true }])], cardio: [] as CardioEntry[] }
    const pending = { exercises: [ex('a', [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }])], cardio: [] as CardioEntry[] }
    expect(shouldRecoverFromPending(pending, server)).toBe(true)
  })

  test('does NOT recover when the server already has everything', () => {
    const both = { exercises: [ex('a', [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }])], cardio: [] as CardioEntry[] }
    expect(shouldRecoverFromPending(both, both)).toBe(false)
  })

  test('never recovers a logged set the server is ahead on (additive only)', () => {
    const server = { exercises: [ex('a', [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }])], cardio: [] as CardioEntry[] }
    const pending = { exercises: [ex('a', [{ w: 60, r: 10, done: true }])], cardio: [] as CardioEntry[] }
    expect(shouldRecoverFromPending(pending, server)).toBe(false)
  })

  test('recovers a cardio bout the server is missing', () => {
    const server = { exercises: [] as SavedExercise[], cardio: [] as CardioEntry[] }
    const pending = { exercises: [] as SavedExercise[], cardio: [{ type: 'run', durationMin: 20 } as CardioEntry] }
    expect(shouldRecoverFromPending(pending, server)).toBe(true)
  })
})

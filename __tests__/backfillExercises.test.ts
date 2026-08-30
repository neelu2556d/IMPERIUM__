import {
  buildBackfillExercises,
  mergeBackfillExercises,
  validateBackfillInputs,
  MAX_WEIGHT_DISPLAY,
  MAX_REPS,
} from '@/lib/workouts/backfill'
import type { SavedExercise } from '@/lib/workouts/queries'

/**
 * The past-workout ("Log a past workout") form collects a list of lifts, each
 * with one or more sets. buildBackfillExercises turns that into the canonical
 * SavedExercise[] JSONB shape the workouts row stores — converting display
 * weights to kg and classifying each set (done / missed) the same way the live
 * logger does, so history + graphs read a backfilled session identically.
 */

test('builds a finished lift from simple, identical sets (metric)', () => {
  const out = buildBackfillExercises(
    [{ id: 'bench_bb', name: 'Bench Press', targetReps: 8, sets: [
      { weight: 80, reps: 8, missed: false },
      { weight: 80, reps: 8, missed: false },
      { weight: 80, reps: 8, missed: false },
    ] }],
    'metric',
  )
  expect(out).toHaveLength(1)
  expect(out[0]).toMatchObject({ id: 'bench_bb', name: 'Bench Press', targetSets: 3, targetReps: 8 })
  expect(out[0].sets).toHaveLength(3)
  expect(out[0].sets[0]).toEqual({ weight: 80, reps: 8, done: true, failed: false })
})

test('a missed set is recorded as failed, not done', () => {
  const out = buildBackfillExercises(
    [{ id: 'sq', name: 'Squat', targetReps: 5, sets: [
      { weight: 100, reps: 5, missed: false },
      { weight: 100, reps: 2, missed: true },
    ] }],
    'metric',
  )
  expect(out[0].sets[0]).toEqual({ weight: 100, reps: 5, done: true, failed: false })
  expect(out[0].sets[1]).toMatchObject({ done: false, failed: true })
})

test('a set with fewer reps than target still logs (counts as done/partial)', () => {
  const out = buildBackfillExercises(
    [{ id: 'ohp', name: 'OHP', targetReps: 8, sets: [{ weight: 40, reps: 5, missed: false }] }],
    'metric',
  )
  expect(out[0].sets[0]).toEqual({ weight: 40, reps: 5, done: true, failed: false })
})

test('imperial weights convert to kg', () => {
  const out = buildBackfillExercises(
    [{ id: 'bench_bb', name: 'Bench', targetReps: 8, sets: [{ weight: 176, reps: 8, missed: false }] }],
    'imperial',
  )
  expect(out[0].sets[0].weight).toBeCloseTo(79.8, 1)
})

test('drops empty set rows and nameless lifts', () => {
  const out = buildBackfillExercises(
    [
      { id: 'x', name: '   ', targetReps: 8, sets: [{ weight: 50, reps: 8, missed: false }] },
      { id: 'y', name: 'Curl', targetReps: 12, sets: [
        { weight: null, reps: null, missed: false },
        { weight: 15, reps: 12, missed: false },
      ] },
    ],
    'metric',
  )
  expect(out).toHaveLength(1)
  expect(out[0].name).toBe('Curl')
  expect(out[0].sets).toHaveLength(1)
})

test('returns an empty array when nothing usable was entered', () => {
  const out = buildBackfillExercises(
    [{ id: 'z', name: 'Ghost', targetReps: 8, sets: [{ weight: null, reps: null, missed: false }] }],
    'metric',
  )
  expect(out).toEqual([])
})

// ── mergeBackfillExercises: how a backfilled session folds into the existing
//    "(history)" row — replace a same-id entry (a correction), append new ones,
//    never touch unrelated exercises already stored that day.
test('merge replaces a same-id exercise and appends new ones', () => {
  const prior: SavedExercise[] = [
    { id: 'bench_bb', name: 'Bench', targetSets: 1, targetReps: 8, sets: [{ weight: 70, reps: 8, done: true, failed: false }] },
    { id: 'row', name: 'Row', targetSets: 1, targetReps: 10, sets: [{ weight: 60, reps: 10, done: true, failed: false }] },
  ]
  const incoming: SavedExercise[] = [
    { id: 'bench_bb', name: 'Bench', targetSets: 3, targetReps: 8, sets: [{ weight: 80, reps: 8, done: true, failed: false }] },
    { id: 'ohp', name: 'OHP', targetSets: 3, targetReps: 8, sets: [{ weight: 40, reps: 8, done: true, failed: false }] },
  ]
  const merged = mergeBackfillExercises(prior, incoming)
  expect(merged.map(e => e.id)).toEqual(['bench_bb', 'row', 'ohp'])
  // bench corrected to the new sets, row untouched, ohp appended
  expect(merged.find(e => e.id === 'bench_bb')!.sets[0].weight).toBe(80)
  expect(merged.find(e => e.id === 'row')!.sets[0].weight).toBe(60)
})

test('merge into an empty history row just returns the incoming exercises', () => {
  const incoming: SavedExercise[] = [
    { id: 'sq', name: 'Squat', targetSets: 3, targetReps: 5, sets: [{ weight: 100, reps: 5, done: true, failed: false }] },
  ]
  expect(mergeBackfillExercises([], incoming)).toEqual(incoming)
})

// ── validateBackfillInputs: catch fat-finger weights/reps before they corrupt
//    the history graph + PR detection.
test('validation rejects an absurd weight with a friendly message', () => {
  const err = validateBackfillInputs([
    { id: 'b', name: 'Bench', targetReps: 8, sets: [{ weight: 99999, reps: 8, missed: false }] },
  ])
  expect(err).toMatch(/too high/i)
  expect(err).toMatch(/Bench/)
})

test('validation rejects an absurd rep count', () => {
  const err = validateBackfillInputs([
    { id: 'b', name: 'Bench', targetReps: 8, sets: [{ weight: 80, reps: 999, missed: false }] },
  ])
  expect(err).toMatch(/too high/i)
})

test('validation passes realistic numbers and respects the documented ceilings', () => {
  expect(validateBackfillInputs([
    { id: 'b', name: 'Bench', targetReps: 8, sets: [{ weight: MAX_WEIGHT_DISPLAY, reps: MAX_REPS, missed: false }] },
  ])).toBeNull()
  expect(validateBackfillInputs([
    { id: 'b', name: 'Bench', targetReps: 8, sets: [{ weight: 80, reps: 8, missed: false }] },
  ])).toBeNull()
})

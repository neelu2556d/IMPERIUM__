import { reconcileExercises } from '@/app/app/fitness/log/reconcile'
import type { SavedExercise } from '@/lib/workouts/queries'

// Minimal builders
const def = (id: string, sets = 3, reps = 8) => ({ id, sets, reps })
const saved = (id: string, opts: Partial<SavedExercise> = {}): SavedExercise => ({
  id,
  name: id,
  targetSets: opts.targetSets ?? 3,
  targetReps: opts.targetReps ?? 8,
  sets: opts.sets ?? [{ weight: 50, reps: 8, done: true, failed: false }],
  ...(opts.added !== undefined ? { added: opts.added } : {}),
})

const ids = (slots: ReturnType<typeof reconcileExercises>) => slots.map(s => s.def.id)

test('no saved row → returns the split as-is, no saved sets', () => {
  const day = [def('bench'), def('ohp'), def('incline')]
  const slots = reconcileExercises(day, null)
  expect(ids(slots)).toEqual(['bench', 'ohp', 'incline'])
  expect(slots.every(s => s.saved === null)).toBe(true)
})

test('aligned saved row → positional match keeps split defs and attaches sets', () => {
  const day = [def('bench'), def('ohp')]
  const init = [saved('bench'), saved('ohp')]
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['bench', 'ohp'])
  expect(slots[0].saved?.id).toBe('bench')
  expect(slots[0].def.sets).toBe(3) // from the split def, not the saved row
})

test('swap (saved id not in the split) → def takes the swapped id + the saved shape', () => {
  const day = [def('bench', 4, 6), def('ohp')]
  // bench was swapped to db_press; the saved row carries that slot's shape.
  const init = [saved('db_press', { targetSets: 4, targetReps: 6 }), saved('ohp')]
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['db_press', 'ohp'])
  expect(slots[0].def.sets).toBe(4)
  expect(slots[0].saved?.id).toBe('db_press')
})

test('split has a lift the saved row lacks (mid-day keep race) → no corruption, extra appended', () => {
  const day = [def('conv_dl'), def('ab_wheel'), def('pullup')]
  const init = [saved('conv_dl'), saved('pullup')] // workouts row not yet caught up
  const slots = reconcileExercises(day, init)
  // id-matching: nothing shifts onto the wrong row, no duplicate; the missing
  // split lift is appended fresh rather than corrupting the order.
  expect(ids(slots)).toEqual(['conv_dl', 'pullup', 'ab_wheel'])
  expect(slots[2].saved).toBeNull()
})

test('saved order is preserved even when it differs from the split order', () => {
  const day = [def('a'), def('b'), def('c')]
  const init = [saved('c'), saved('a'), saved('b')]
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['c', 'a', 'b'])
})

test('added lift interleaved → split slots still align to their own saved sets (no orphan)', () => {
  const day = [def('bench'), def('ohp')]
  // user added "cable_fly" after bench: saved order is bench, fly(added), ohp
  const init = [
    saved('bench', { sets: [{ weight: 80, reps: 6, done: true, failed: false }] }),
    saved('cable_fly', { added: true, targetSets: 3, targetReps: 12 }),
    saved('ohp', { sets: [{ weight: 40, reps: 8, done: true, failed: false }] }),
  ]
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['bench', 'cable_fly', 'ohp'])
  // the added slot is flagged + carries its own saved shape
  expect(slots[1].def.added).toBe(true)
  expect(slots[1].def.sets).toBe(3)
  // CRITICAL: ohp keeps ITS sets (40kg), not orphaned onto the wrong row
  expect(slots[2].saved?.sets[0].weight).toBe(40)
  expect(slots[0].saved?.sets[0].weight).toBe(80)
})

test('added lift at the end', () => {
  const day = [def('bench')]
  const init = [saved('bench'), saved('extra', { added: true })]
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['bench', 'extra'])
  expect(slots[1].def.added).toBe(true)
})

test('split grew (more split slots than saved rows) → extra split slots appended fresh', () => {
  const day = [def('bench'), def('ohp'), def('fly')]
  const init = [saved('bench'), saved('ohp')] // fly added to split later, not yet saved today
  const slots = reconcileExercises(day, init)
  expect(ids(slots)).toEqual(['bench', 'ohp', 'fly'])
  expect(slots[2].saved).toBeNull()
})

import { saveBackfillWorkout } from '@/lib/workouts/queries'
import { BACKFILL_DAY_NAME } from '@/lib/workouts/queries'
import type { SavedExercise } from '@/lib/workouts/queries'

/**
 * saveBackfillWorkout writes a whole backfilled session into the shared
 * "(history)" sentinel row (merged by exercise id) — NEVER a real training
 * day_name. This keeps backfilled data cleanly separated from the user's real
 * rotation rows (the deliberate design of saveBackfillSession), and is the fix
 * for the "Log a past workout" form having written real day_name rows.
 */

function makeFakeSupabase(seed: { exercises: SavedExercise[] } | null) {
  let stored = seed ? { ...seed } : null
  let lastUpsert: Record<string, unknown> | null = null
  function from(_t: string) {
    const state: { op: 'select' | 'upsert' | null; upsertRow: Record<string, unknown> | null } = { op: null, upsertRow: null }
    const builder: Record<string, unknown> = {
      select() { state.op = 'select'; return builder },
      upsert(row: Record<string, unknown>) { state.op = 'upsert'; state.upsertRow = row; return builder },
      eq() { return builder },
      maybeSingle() { return Promise.resolve({ data: stored, error: null }) },
      then(resolve: (v: { error: null }) => void) {
        if (state.op === 'upsert' && state.upsertRow) {
          lastUpsert = state.upsertRow
          stored = { exercises: state.upsertRow.exercises as SavedExercise[] }
        }
        resolve({ error: null })
      },
    }
    return builder
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: { from } as any,
    get stored() { return stored },
    get lastUpsert() { return lastUpsert },
  }
}

const bench: SavedExercise = { id: 'bench_bb', name: 'Bench', targetSets: 3, targetReps: 8, sets: [{ weight: 80, reps: 8, done: true, failed: false }] }
const row: SavedExercise = { id: 'row', name: 'Row', targetSets: 1, targetReps: 10, sets: [{ weight: 60, reps: 10, done: true, failed: false }] }

test('writes to the (history) sentinel day_name, never a real session name', async () => {
  const fake = makeFakeSupabase(null)
  await saveBackfillWorkout(fake.client, { userId: 'u1', date: '2026-06-19', exercises: [bench] })
  expect(fake.lastUpsert!.day_name).toBe(BACKFILL_DAY_NAME)
  expect(fake.lastUpsert!.date).toBe('2026-06-19')
})

test('merges into an existing (history) row without clobbering other exercises', async () => {
  const fake = makeFakeSupabase({ exercises: [row] })
  await saveBackfillWorkout(fake.client, { userId: 'u1', date: '2026-06-19', exercises: [bench] })
  const ids = (fake.stored!.exercises as SavedExercise[]).map(e => e.id).sort()
  expect(ids).toEqual(['bench_bb', 'row'])
})

test('no-ops on an empty exercise list (never writes an empty row)', async () => {
  const fake = makeFakeSupabase(null)
  await saveBackfillWorkout(fake.client, { userId: 'u1', date: '2026-06-19', exercises: [] })
  expect(fake.lastUpsert).toBeNull()
})

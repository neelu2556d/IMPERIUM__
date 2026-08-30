import { setExerciseTune } from '@/app/app/fitness/setup/tuneState'
import type { DayExercise } from '@/app/app/fitness/log/splitData'

const base: DayExercise[] = [
  { id: 'bench_bb', sets: 4, reps: 6 },
  { id: 'ohp', sets: 3, reps: 8 },
]

describe('setExerciseTune', () => {
  it('writes weight/rest/sets/reps and marks the lift tuned', () => {
    const next = setExerciseTune(base, 'bench_bb', { weightKg: 60, restSec: 150, sets: 5, reps: 5 })
    const row = next.find(e => e.id === 'bench_bb')!
    expect(row).toMatchObject({ weightKg: 60, restSec: 150, sets: 5, reps: 5, tuned: true })
  })

  it('does not mutate the input array or other rows', () => {
    const next = setExerciseTune(base, 'bench_bb', { weightKg: 60, restSec: 150, sets: 5, reps: 5 })
    expect(next).not.toBe(base)
    expect(base[0].tuned).toBeUndefined()
    expect(next.find(e => e.id === 'ohp')).toEqual({ id: 'ohp', sets: 3, reps: 8 })
  })

  it('returns the list unchanged when the id is absent', () => {
    const next = setExerciseTune(base, 'nope', { weightKg: 60, restSec: 150, sets: 5, reps: 5 })
    expect(next).toEqual(base)
  })
})

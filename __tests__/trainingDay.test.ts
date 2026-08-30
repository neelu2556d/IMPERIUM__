import { guessTrainingDay } from '@/lib/workouts/trainingDay'
import type { SplitDay } from '@/app/app/fitness/log/splitData'

const rotation: SplitDay[] = [
  { day: 1, name: 'Push heavy', type: 'HEAVY', category: 'push', exercises: [] },
  { day: 2, name: 'Pull heavy', type: 'HEAVY', category: 'pull', exercises: [] },
  { day: 3, name: 'Legs heavy', type: 'HEAVY', category: 'legs', exercises: [] },
]

describe('guessTrainingDay', () => {
  it('steps to the next day in the rotation after the last logged day', () => {
    const r = guessTrainingDay(rotation, { dayName: 'Pull heavy', date: '2026-06-12' }, '2026-06-13')
    expect(r.guess?.name).toBe('Legs heavy')
    expect(r.options).toHaveLength(3)
    expect(r.reason).toContain('Pull heavy')
  })

  it('wraps around at the end of the rotation', () => {
    const r = guessTrainingDay(rotation, { dayName: 'Legs heavy', date: '2026-06-12' }, '2026-06-13')
    expect(r.guess?.name).toBe('Push heavy')
  })

  it('returns no guess when there is no prior workout', () => {
    const r = guessTrainingDay(rotation, null, '2026-06-13')
    expect(r.guess).toBeNull()
    expect(r.options).toHaveLength(3)
  })

  it('returns no guess when the last day is not in the current rotation', () => {
    const r = guessTrainingDay(rotation, { dayName: 'Arms', date: '2026-06-12' }, '2026-06-13')
    expect(r.guess).toBeNull()
  })

  it('returns no guess and empty options when rotation is empty', () => {
    const r = guessTrainingDay([], { dayName: 'Push heavy', date: '2026-06-12' }, '2026-06-13')
    expect(r.guess).toBeNull()
    expect(r.options).toHaveLength(0)
  })
})

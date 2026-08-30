/**
 * Tests for the Progress module's derived signals (app/app/fitness/progress/signals.ts).
 *
 * The product promise: an eased / off-day session (off_day = 'little' | 'rough' |
 * 'deload') NEVER dents progress. These tests lock in that an eased session is
 * invisible to the PR/regression ticker AND to the body-composition volume trend,
 * so a light deload or sick day can't fake a regression, poison the PR baseline,
 * or drag the user's phase toward "losing".
 *
 *   npx jest progressSignals --testPathIgnorePatterns "/node_modules/"
 */

import { computeLiftSignals, computeCompositionSignal } from '@/app/app/fitness/progress/signals'
import type { SavedExercise, SavedWorkout } from '@/lib/workouts/queries'

const ex = (id: string, name: string, weight: number, reps: number): SavedExercise => ({
  id,
  name,
  targetSets: 3,
  targetReps: reps,
  sets: [{ weight, reps, done: true, failed: false }],
})

const wk = (
  date: string,
  exercises: SavedExercise[],
  off_day: SavedWorkout['off_day'] = null,
): SavedWorkout => ({
  date,
  day_name: 'Push',
  exercises,
  submitted_at: `${date}T12:00:00Z`,
  off_day,
})

/** A local YYYY-MM-DD date `n` days before today (the composition window is 28d
 *  relative to Date.now(), so fixtures must be anchored to the real present). */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('computeLiftSignals — off-day exclusion', () => {
  it('does not emit a PR from an eased (off_day) session even if the number is higher', () => {
    const workouts = [
      wk('2026-06-01', [ex('bench_bb', 'Bench', 80, 5)]),
      wk('2026-06-08', [ex('bench_bb', 'Bench', 120, 5)], 'little'), // eased — ignore
    ]
    expect(computeLiftSignals(workouts)).toHaveLength(0)
  })

  it('does not emit a regression from an eased (off_day) light session', () => {
    const workouts = [
      wk('2026-06-01', [ex('bench_bb', 'Bench', 100, 5)]),
      wk('2026-06-08', [ex('bench_bb', 'Bench', 60, 5)], 'rough'), // eased light — would be a fake regression
    ]
    expect(computeLiftSignals(workouts).filter(s => s.kind === 'regress_weight')).toHaveLength(0)
  })

  it('an eased session does not become the PR baseline', () => {
    const workouts = [
      wk('2026-06-01', [ex('bench_bb', 'Bench', 80, 5)]),
      wk('2026-06-08', [ex('bench_bb', 'Bench', 60, 5)], 'deload'), // eased — ignored
      wk('2026-06-15', [ex('bench_bb', 'Bench', 85, 5)]), // +5 over the REAL baseline of 80 → PR
    ]
    const s = computeLiftSignals(workouts)
    expect(s).toHaveLength(1)
    expect(s[0].kind).toBe('pr_weight')
    expect(s[0].previousWeightKg).toBe(80) // compared to the real baseline, never the eased 60
  })

  it('still emits a PR from a normal session (does not over-filter)', () => {
    const workouts = [
      wk('2026-06-01', [ex('bench_bb', 'Bench', 80, 5)]),
      wk('2026-06-08', [ex('bench_bb', 'Bench', 90, 5)]),
    ]
    const s = computeLiftSignals(workouts)
    expect(s).toHaveLength(1)
    expect(s[0].kind).toBe('pr_weight')
  })
})

describe('computeCompositionSignal — off-day exclusion', () => {
  it('an eased session does not change the volume trend or phase', () => {
    const normal = [
      wk(daysAgo(20), [ex('bench_bb', 'Bench', 100, 5)]),
      wk(daysAgo(13), [ex('bench_bb', 'Bench', 100, 5)]),
      wk(daysAgo(6), [ex('bench_bb', 'Bench', 100, 5)]),
    ]
    // A near-zero-volume eased session appended right before "today" — if it
    // counted, it would tank the volume-load trend and could flip the phase.
    const withEased = [...normal, wk(daysAgo(3), [ex('bench_bb', 'Bench', 40, 3)], 'deload')]

    const a = computeCompositionSignal([], normal)
    const b = computeCompositionSignal([], withEased)
    expect(b.volumeTrendPct).toEqual(a.volumeTrendPct)
    expect(b.phase).toEqual(a.phase)
  })
})

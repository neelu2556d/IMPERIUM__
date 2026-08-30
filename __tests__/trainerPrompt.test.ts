/**
 * Tests for the Trainer prompt builder (lib/workouts/trainerPrompt.ts) — the
 * pure function that turns a live workout snapshot into the plain-English
 * question we hand to Claude via claude.ai/new?q=. No IO; display-unit in,
 * string out. Run with:
 *   npx jest trainerPrompt --testPathIgnorePatterns "/node_modules/"
 */

import {
  buildTrainerPrompt,
  type TrainerSnapshot,
} from '@/lib/workouts/trainerPrompt'

function snap(over: Partial<TrainerSnapshot> = {}): TrainerSnapshot {
  return {
    dayName: 'Push heavy',
    unitLabel: 'lb',
    focusName: 'Bench Press',
    exercises: [
      {
        name: 'Bench Press',
        prevBest: { weight: 185, reps: 6 },
        sets: [
          { weight: 185, reps: 6, done: true, failed: false },
          { weight: 185, reps: 4, done: false, failed: true },
        ],
      },
      {
        name: 'Incline DB Press',
        prevBest: { weight: 70, reps: 10 },
        sets: [
          { weight: null, reps: null, done: false, failed: false },
          { weight: null, reps: null, done: false, failed: false },
        ],
      },
    ],
    ...over,
  }
}

describe('buildTrainerPrompt', () => {
  it('names the day', () => {
    expect(buildTrainerPrompt(snap())).toContain('Push heavy')
  })

  it('renders a completed set with weight and reps in the display unit', () => {
    expect(buildTrainerPrompt(snap())).toContain('185 lb x 6')
  })

  it('flags a failed set as missed', () => {
    const out = buildTrainerPrompt(snap())
    expect(out).toContain('185 lb x 4 (missed)')
  })

  it('includes the previous best for the exercise', () => {
    expect(buildTrainerPrompt(snap())).toContain('best 185 lb x 6')
  })

  it('marks an untouched exercise as not started', () => {
    expect(buildTrainerPrompt(snap())).toContain('Incline DB Press: not started')
  })

  it('asks about the focus exercise when one is set', () => {
    expect(buildTrainerPrompt(snap())).toContain('got stuck on Bench Press')
  })

  it('falls back to a generic question when there is no focus', () => {
    const out = buildTrainerPrompt(snap({ focusName: null }))
    expect(out).not.toContain('got stuck on')
    expect(out.length).toBeGreaterThan(40)
  })

  it('handles a bodyweight set (reps only, no weight)', () => {
    const out = buildTrainerPrompt(
      snap({
        focusName: 'Pull-up',
        exercises: [
          {
            name: 'Pull-up',
            prevBest: null,
            sets: [{ weight: null, reps: 12, done: true, failed: false }],
          },
        ],
      }),
    )
    expect(out).toContain('12 reps')
  })

  it('leads with the user message when one is typed, session attached below', () => {
    const out = buildTrainerPrompt(snap(), 'My shoulder twinges on this — swap it?')
    expect(out.startsWith('My shoulder twinges on this')).toBe(true)
    expect(out).toContain('For context')
    expect(out).toContain('185 lb x 4 (missed)') // session still attached
  })

  it('ignores a blank/whitespace user message and uses the generic ask', () => {
    const out = buildTrainerPrompt(snap(), '   ')
    expect(out).toContain('got stuck on Bench Press')
    expect(out).not.toContain('For context')
  })

  it('never throws on an empty session', () => {
    const out = buildTrainerPrompt(
      snap({ exercises: [], focusName: null }),
    )
    expect(typeof out).toBe('string')
    expect(out).toContain('Push heavy')
  })
})

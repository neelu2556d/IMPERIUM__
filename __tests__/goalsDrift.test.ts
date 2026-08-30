import { detectDrift, daysBetween, type DriftInput } from '@/lib/goals/drift'

const BASE: DriftInput = {
  today: '2026-06-18',
  daysSinceLastWorkout: null,
  workoutsLast21: 0,
  daysSinceLastMeal: null,
  mealDaysLast21: 0,
  recoveryRecentAvg: null,
  recoveryPriorAvg: null,
  recoveryReadings14: 0,
  cooldown: {},
}

describe('detectDrift', () => {
  it('says nothing for someone who was never active (no false guilt)', () => {
    expect(detectDrift(BASE)).toBeNull()
  })

  it('flags training that went quiet for a regular trainer', () => {
    const n = detectDrift({ ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 5 })
    expect(n?.kind).toBe('train')
  })

  it('does NOT flag training for someone who barely trains', () => {
    expect(detectDrift({ ...BASE, workoutsLast21: 1, daysSinceLastWorkout: 8 })).toBeNull()
  })

  it('does NOT flag training within the grace window (3 days)', () => {
    expect(detectDrift({ ...BASE, workoutsLast21: 6, daysSinceLastWorkout: 3 })).toBeNull()
  })

  it('does NOT flag training when the gap is too old to honestly call recent', () => {
    expect(detectDrift({ ...BASE, workoutsLast21: 6, daysSinceLastWorkout: 20 })).toBeNull()
  })

  it('flags fuel going quiet for a regular logger', () => {
    const n = detectDrift({ ...BASE, mealDaysLast21: 10, daysSinceLastMeal: 4 })
    expect(n?.kind).toBe('fuel')
  })

  it('prioritises training over fuel when both drift', () => {
    const n = detectDrift({ ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6, mealDaysLast21: 10, daysSinceLastMeal: 4 })
    expect(n?.kind).toBe('train')
  })

  it('flags a real recovery dip vs the personal baseline', () => {
    const n = detectDrift({ ...BASE, recoveryReadings14: 8, recoveryPriorAvg: 70, recoveryRecentAvg: 52 })
    expect(n?.kind).toBe('recovery')
  })

  it('ignores a tiny recovery wobble', () => {
    expect(detectDrift({ ...BASE, recoveryReadings14: 8, recoveryPriorAvg: 70, recoveryRecentAvg: 64 })).toBeNull()
  })

  it('stays quiet while a shown nudge is still resting (2-day window)', () => {
    const n = detectDrift({
      ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6,
      cooldown: { train: { lastNudgedAt: '2026-06-17T10:00:00Z', resolution: null } },
    })
    expect(n).toBeNull()
  })

  it('rests longer after the user resolved it (graced = 12 days)', () => {
    const stillResting = detectDrift({
      ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6,
      cooldown: { train: { lastNudgedAt: '2026-06-10T10:00:00Z', resolution: 'graced' } },
    })
    expect(stillResting).toBeNull()
    const pastWindow = detectDrift({
      ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6,
      cooldown: { train: { lastNudgedAt: '2026-06-01T10:00:00Z', resolution: 'graced' } },
    })
    expect(pastWindow?.kind).toBe('train')
  })

  it('daysBetween counts forward days correctly', () => {
    expect(daysBetween('2026-06-10', '2026-06-18')).toBe(8)
  })
})

describe('detectDrift — user-built tile streams (the generic domain)', () => {
  const beer = { canonicalKey: 'alcohol', label: 'Beer', daysSinceLastReport: 5, reportDaysLast21: 8 }
  const read = { canonicalKey: 'reading', label: 'Reading', daysSinceLastReport: 6, reportDaysLast21: 12 }

  it('flags a stream the user showed up for that went quiet', () => {
    const n = detectDrift({ ...BASE, streams: [beer] })
    expect(n?.kind).toBe('stream:alcohol')
    expect(n?.line).toBe('Your Beer tile has gone quiet.')
  })

  it('never guilts a stream the user barely used', () => {
    expect(detectDrift({ ...BASE, streams: [{ ...beer, reportDaysLast21: 3 }] })).toBeNull()
  })

  it('respects the grace window and the too-old cutoff', () => {
    expect(detectDrift({ ...BASE, streams: [{ ...beer, daysSinceLastReport: 3 }] })).toBeNull()
    expect(detectDrift({ ...BASE, streams: [{ ...beer, daysSinceLastReport: 20 }] })).toBeNull()
    expect(detectDrift({ ...BASE, streams: [{ ...beer, daysSinceLastReport: null }] })).toBeNull()
  })

  it('core domains always outrank a stream (still at most ONE nudge)', () => {
    const n = detectDrift({ ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6, streams: [beer] })
    expect(n?.kind).toBe('train')
  })

  it('picks the most-used stream, deterministic on ties', () => {
    const n = detectDrift({ ...BASE, streams: [beer, read] })
    expect(n?.kind).toBe('stream:reading') // 12 report days beats 8
    const tie = detectDrift({ ...BASE, streams: [{ ...read, reportDaysLast21: 8 }, beer] })
    expect(tie?.kind).toBe('stream:alcohol') // alphabetical on ties
  })

  it('each stream rests on its OWN cooldown clock', () => {
    const n = detectDrift({
      ...BASE,
      streams: [beer, read],
      cooldown: { 'stream:reading': { lastNudgedAt: '2026-06-17T10:00:00Z', resolution: null } },
    })
    expect(n?.kind).toBe('stream:alcohol') // reading rests, beer can still surface
  })

  it('a resolved stream nudge rests the long window', () => {
    const stillResting = detectDrift({
      ...BASE,
      streams: [beer],
      cooldown: { 'stream:alcohol': { lastNudgedAt: '2026-06-10T10:00:00Z', resolution: 'graced' } },
    })
    expect(stillResting).toBeNull()
  })
})

describe('goal-aware drift', () => {
  const trainingDrift: DriftInput = { ...BASE, workoutsLast21: 5, daysSinceLastWorkout: 6 }

  it('names the goal when one feeds the drifting domain', () => {
    const n = detectDrift({
      ...trainingDrift,
      goalByKind: { train: { id: 'g1', title: 'Bench 225 for 5', push: 'balanced', targetDate: null } },
    })
    expect(n?.kind).toBe('train')
    expect(n?.goalId).toBe('g1')
    expect(`${n?.line} ${n?.sub}`).toContain('Bench 225 for 5')
  })

  it('falls back to generic copy when no goal feeds the domain', () => {
    const n = detectDrift(trainingDrift)
    expect(n?.goalId).toBeUndefined()
    expect(n?.line).not.toContain('225')
  })

  it('a push goal speaks up sooner (1-day window vs the default 2)', () => {
    const cooldown = { train: { lastNudgedAt: '2026-06-17T10:00:00Z', resolution: null } } // 1 day ago
    // default (no goal) is still resting at 1 day
    expect(detectDrift({ ...trainingDrift, cooldown })).toBeNull()
    // a push goal's shorter window has already elapsed -> it fires
    const n = detectDrift({
      ...trainingDrift, cooldown,
      goalByKind: { train: { id: 'g1', title: 'X', push: 'push', targetDate: null } },
    })
    expect(n?.kind).toBe('train')
  })

  it('a gentle goal rests longer (4-day window)', () => {
    const cooldown = { train: { lastNudgedAt: '2026-06-15T10:00:00Z', resolution: null } } // 3 days ago
    // default would fire at 3 days (> the 2-day window)
    expect(detectDrift({ ...trainingDrift, cooldown })?.kind).toBe('train')
    // a gentle goal is still resting at 3 days (< its 4-day window)
    expect(detectDrift({
      ...trainingDrift, cooldown,
      goalByKind: { train: { id: 'g1', title: 'X', push: 'gentle', targetDate: null } },
    })).toBeNull()
  })

  it('a goal never manufactures guilt where there was no real drift', () => {
    // still inside the 3-day grace window -> no trigger, even with a push goal
    expect(detectDrift({
      ...BASE, workoutsLast21: 6, daysSinceLastWorkout: 3,
      goalByKind: { train: { id: 'g1', title: 'X', push: 'push', targetDate: null } },
    })).toBeNull()
  })
})

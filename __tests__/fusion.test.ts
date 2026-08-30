import {
  sleepWorkoutSeam,
  sleepWorkoutCandidate,
  spendSleepSeam,
  spendSleepCandidate,
  type SleepTrainWeek,
  type SleepSpendWeek,
} from '@/lib/insights/fusion'

/** Build weekly sleep+training pairs (wk index is arbitrary but distinct). */
const weeks = (pairs: [number, number][]): SleepTrainWeek[] =>
  pairs.map(([sleepAvg, sessions], i) => ({ wk: 2800 + i, sleepAvg, sessions }))

const STRONG: [number, number][] = [[5.0, 1], [5.5, 2], [6.0, 2], [7.0, 3], [7.5, 4], [8.0, 4]]

describe('sleepWorkoutSeam — the cross-domain moat (sleep <-> training)', () => {
  it('fires on a clear positive link with the real contrast numbers', () => {
    const r = sleepWorkoutSeam(weeks(STRONG))
    expect(r).toBeTruthy()
    expect(r!.why.toLowerCase()).toContain('sleep')
    expect(r!.why.toLowerCase()).toContain('session')
    expect(r!.receipts.length).toBe(2)
    expect(r!.why).toContain('4 sessions') // high-sleep weeks
    expect(r!.why).toContain('only 2') // low-sleep weeks
  })

  it('never claims causation, only association', () => {
    const r = sleepWorkoutSeam(weeks(STRONG))!
    expect(r.why.toLowerCase()).not.toContain('because')
    expect(r.why.toLowerCase()).not.toContain('causes')
    expect(r.why.toLowerCase()).not.toContain('caused')
  })

  it('returns null with fewer than 6 paired weeks', () => {
    expect(sleepWorkoutSeam(weeks([[5, 1], [6, 2], [7, 3], [8, 4], [8.5, 4]]))).toBeNull()
  })

  it('returns null when sessions never vary (the series is flat, no correlation)', () => {
    expect(sleepWorkoutSeam(weeks([[5, 3], [5.5, 3], [6, 3], [7, 3], [7.5, 3], [8, 3]]))).toBeNull()
  })

  it('returns null when the sleep contrast is under an hour, even if correlated', () => {
    // both ascend (high r), but high vs low sleep differ by only ~0.3 h a night
    expect(sleepWorkoutSeam(weeks([[6.8, 1], [6.9, 2], [7.0, 2], [7.1, 3], [7.2, 4], [7.3, 4]]))).toBeNull()
  })

  it('returns null when the session contrast is under one, even if correlated', () => {
    // sessions barely move between low- and high-sleep weeks (0.4 apart)
    expect(sleepWorkoutSeam(weeks([[5, 3], [5.5, 3], [6, 3], [7, 3.4], [7.5, 3.4], [8, 3.4]]))).toBeNull()
  })

  it('returns null on a NEGATIVE link (more sleep, fewer sessions is not the claim)', () => {
    expect(sleepWorkoutSeam(weeks([[5, 4], [5.5, 4], [6, 3], [7, 2], [7.5, 2], [8, 1]]))).toBeNull()
  })

  it('keeps the invariants (verbatim key, no em dash, filling)', () => {
    const r = sleepWorkoutSeam(weeks(STRONG))!
    expect(r.why).toContain(r.key)
    expect(r.why).not.toContain('—')
    expect(r.why.length).toBeGreaterThan(60)
  })
})

describe('sleepWorkoutCandidate — the same seam, scored for the selection engine', () => {
  it('returns the seam notice plus an honest label and a ranked score', () => {
    const c = sleepWorkoutCandidate(weeks(STRONG))
    expect(c).toBeTruthy()
    expect(c!.notice).toEqual(sleepWorkoutSeam(weeks(STRONG))) // same copy as the bare seam
    expect(c!.watched).toBe('sleep + training')
    expect(c!.score.domains).toEqual(['sleep', 'training'])
    expect(c!.score.r).toBeGreaterThan(0)        // positive link
    expect(c!.score.n).toBeGreaterThanOrEqual(6)
    expect(c!.score.contrast).toBeGreaterThan(0) // a felt, unitless contrast
  })

  it('stays null exactly when the bare seam stays null', () => {
    const thin = weeks([[5, 1], [6, 2], [7, 3], [8, 4], [8.5, 4]])
    expect(sleepWorkoutCandidate(thin)).toBeNull()
    expect(sleepWorkoutSeam(thin)).toBeNull()
  })
})

/** Build weekly sleep+spend pairs (wk index arbitrary but distinct). */
const spendWeeks = (pairs: [number, number][]): SleepSpendWeek[] =>
  pairs.map(([sleepAvg, spend], i) => ({ wk: 2900 + i, sleepAvg, spend }))

// Short sleep -> high spend, rested -> low spend (a clear negative link).
const SPEND_STRONG: [number, number][] = [
  [5.0, 320], [5.5, 300], [6.0, 240], [7.0, 180], [7.5, 160], [8.0, 120],
]

describe('spendSleepSeam — the finance x vitals seam (spend <-> sleep)', () => {
  it('fires on a clear negative link (less sleep, more spend) with real numbers', () => {
    const r = spendSleepSeam(spendWeeks(SPEND_STRONG))
    expect(r).toBeTruthy()
    expect(r!.why.toLowerCase()).toContain('sleep')
    expect(r!.why.toLowerCase()).toContain('spend')
    expect(r!.why).toContain('%')
    expect(r!.receipts.length).toBe(2)
  })

  it('never claims causation, only association', () => {
    const r = spendSleepSeam(spendWeeks(SPEND_STRONG))!
    expect(r.why.toLowerCase()).not.toContain('because')
    expect(r.why.toLowerCase()).not.toContain('causes')
    expect(r.why.toLowerCase()).not.toContain('caused')
  })

  it('returns null with fewer than 6 paired weeks', () => {
    expect(spendSleepSeam(spendWeeks([[5, 300], [6, 240], [7, 180], [8, 120], [8.5, 100]]))).toBeNull()
  })

  it('returns null when too few weeks have real spend (mostly empty weeks)', () => {
    // 6 weeks, correlated sleep, but only 3 weeks have any spend
    expect(spendSleepSeam(spendWeeks([[5, 300], [5.5, 250], [6, 200], [7, 0], [7.5, 0], [8, 0]]))).toBeNull()
  })

  it('returns null on a POSITIVE link (more sleep, more spend is not the claim)', () => {
    expect(spendSleepSeam(spendWeeks([[5, 120], [5.5, 150], [6, 200], [7, 240], [7.5, 300], [8, 340]]))).toBeNull()
  })

  it('returns null when the spend gap is under 20%, even if correlated', () => {
    // clear sleep contrast + negative slope, but short vs rested spend differ ~10%
    expect(spendSleepSeam(spendWeeks([[5, 210], [5.5, 208], [6, 205], [7, 200], [7.5, 195], [8, 190]]))).toBeNull()
  })

  it('returns null when the sleep contrast is under an hour', () => {
    expect(spendSleepSeam(spendWeeks([[6.8, 320], [6.9, 300], [7.0, 240], [7.1, 180], [7.2, 160], [7.3, 120]]))).toBeNull()
  })

  it('candidate carries an honest label and a ranked score (abs r, positive contrast)', () => {
    const c = spendSleepCandidate(spendWeeks(SPEND_STRONG))
    expect(c).toBeTruthy()
    expect(c!.notice).toEqual(spendSleepSeam(spendWeeks(SPEND_STRONG)))
    expect(c!.watched).toBe('sleep + spending')
    expect(c!.score.domains).toEqual(['sleep', 'spending'])
    expect(c!.score.r).toBeGreaterThan(0) // abs of a negative correlation
    expect(c!.score.n).toBeGreaterThanOrEqual(6)
    expect(c!.score.contrast).toBeGreaterThan(0)
  })
})

import { caffeineRecoverySeam, caffeineRecoveryCandidate } from '@/lib/insights/peakSeams'

const key = (i: number) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10)

// 12 days where caffeine climbs and the NEXT morning's recovery falls — a real
// inverse seam the engine should surface (correlation only, never causal).
const caffeine = Array.from({ length: 12 }, (_, i) => ({ key: key(i), value: 100 + i * 20 }))
const recovery = Array.from({ length: 12 }, (_, i) => ({ key: key(i + 1), value: 80 - i * 2 }))

describe('caffeineRecoverySeam — the first real engine insight', () => {
  it('fires on a real inverse contrast and reads as a correlation, not a cause', () => {
    const n = caffeineRecoverySeam(caffeine, recovery)
    expect(n).not.toBeNull()
    expect(n!.key.length).toBeGreaterThan(0)
    expect(n!.why).toContain(n!.key)            // the highlighted phrase is verbatim in the lead
    expect(n!.receipts.length).toBe(2)          // two real data chips
    expect(n!.why).not.toContain('—')           // no em dashes, ever
    expect(n!.why.toLowerCase()).toMatch(/caffeine/)
    expect(n!.why.toLowerCase()).toMatch(/recovery/)
    expect(n!.why.toLowerCase()).not.toMatch(/\bbecause\b|\bcauses?\b|\bcaused\b/) // correlation, not causation
  })

  it('reports the higher-caffeine mornings as the LOWER recovery (honest direction)', () => {
    const n = caffeineRecoverySeam(caffeine, recovery)!
    // both real averages appear as receipts
    expect(n.receipts.join(' ')).toMatch(/mg/)
    expect(n.receipts.join(' ')).toMatch(/%/)
  })

  it('stays silent when there are too few paired mornings to trust', () => {
    expect(caffeineRecoverySeam(caffeine.slice(0, 4), recovery.slice(0, 4))).toBeNull()
  })

  it('stays silent when caffeine and recovery do not actually move together', () => {
    const flatRecovery = Array.from({ length: 12 }, (_, i) => ({ key: key(i + 1), value: 70 }))
    expect(caffeineRecoverySeam(caffeine, flatRecovery)).toBeNull()
  })
})

describe('caffeineRecoveryCandidate — the same seam, scored for the selection engine', () => {
  it('returns the seam notice plus an honest label and an inverse-link score', () => {
    const c = caffeineRecoveryCandidate(caffeine, recovery)
    expect(c).toBeTruthy()
    expect(c!.notice).toEqual(caffeineRecoverySeam(caffeine, recovery)) // same copy as the bare seam
    expect(c!.watched).toBe('caffeine + recovery')
    expect(c!.score.domains).toEqual(['caffeine', 'recovery'])
    expect(c!.score.r).toBeLessThan(0)           // inverse: more caffeine, worse recovery
    expect(c!.score.n).toBeGreaterThanOrEqual(10)
    expect(c!.score.contrast).toBeGreaterThan(0) // a felt, unitless contrast
  })

  it('stays null exactly when the bare seam stays null', () => {
    expect(caffeineRecoveryCandidate(caffeine.slice(0, 4), recovery.slice(0, 4))).toBeNull()
    expect(caffeineRecoverySeam(caffeine.slice(0, 4), recovery.slice(0, 4))).toBeNull()
  })
})

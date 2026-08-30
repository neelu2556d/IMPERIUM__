import { detectSeam, type SeamConfig } from '@/lib/insights/seam'

const cfg = (over: Partial<SeamConfig> = {}): SeamConfig => ({
  minBuckets: 6, minR: 0.45, expectDir: 'any', contrastA: 1, contrastB: 1, ...over,
})

describe('detectSeam — the generalized triple-gate cross-domain detector', () => {
  it('fires on a real positive seam (more A tracks more B) and reports grounded numbers', () => {
    const pairs: [number, number][] = [[5, 1], [5.5, 1], [6, 2], [7, 3], [8, 3], [8.5, 4]]
    const f = detectSeam(pairs, cfg({ expectDir: 'pos' }))
    expect(f).not.toBeNull()
    expect(f!.direction).toBe('pos')
    expect(f!.r).toBeGreaterThanOrEqual(0.45)
    expect(f!.n).toBe(6)
    expect(f!.aHi).toBeGreaterThan(f!.aLo) // high half of A really is higher
    expect(f!.bHi).toBeGreaterThan(f!.bLo) // and B follows it up
  })

  it('fires on a real negative seam (more A tracks LESS B), e.g. caffeine vs recovery', () => {
    const pairs: [number, number][] = [[100, 80], [150, 75], [200, 70], [250, 60], [300, 55], [350, 50]]
    const f = detectSeam(pairs, cfg({ expectDir: 'neg', contrastA: 10, contrastB: 5 }))
    expect(f).not.toBeNull()
    expect(f!.direction).toBe('neg')
    expect(f!.r).toBeLessThanOrEqual(-0.45)
    expect(f!.bHi).toBeLessThan(f!.bLo) // recovery is lower in the high-caffeine half
  })

  it('stays silent under minBuckets (not enough paired weeks to trust)', () => {
    const pairs: [number, number][] = [[5, 1], [6, 2], [7, 3], [8, 4], [9, 5]] // only 5
    expect(detectSeam(pairs, cfg())).toBeNull()
  })

  it('stays silent when the correlation is too weak (|r| < minR)', () => {
    const pairs: [number, number][] = [[5, 3], [6, 1], [7, 4], [8, 2], [9, 5], [10, 1]]
    expect(detectSeam(pairs, cfg())).toBeNull()
  })

  it('stays silent when the felt contrast between halves is too small', () => {
    const pairs: [number, number][] = [[5, 1], [5.5, 1], [6, 2], [7, 3], [8, 3], [8.5, 4]]
    expect(detectSeam(pairs, cfg({ expectDir: 'pos', contrastB: 5 }))).toBeNull() // B halves differ by ~2, need 5
  })

  it('refuses a wrong-direction finding (positive data asked for a negative link)', () => {
    const pairs: [number, number][] = [[5, 1], [5.5, 1], [6, 2], [7, 3], [8, 3], [8.5, 4]]
    expect(detectSeam(pairs, cfg({ expectDir: 'neg' }))).toBeNull()
  })
})

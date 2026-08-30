import { buildVentTeaser, SAMPLE_TEASER, type VentSignals } from '@/app/app/mentor/ventTeaser'

const NONE: VentSignals = { sleepNightsUnder6: 0, sleepNightsTracked: 0, latestRecovery: null, sessionsDone7d: 0 }

describe('buildVentTeaser', () => {
  it('falls back to the honest SAMPLE when there is no notable data (new user)', () => {
    const t = buildVentTeaser(NONE)
    expect(t.real).toBe(false)
    expect(t).toEqual(SAMPLE_TEASER)
  })

  it('does NOT manufacture a sleep teaser from a single short night', () => {
    const t = buildVentTeaser({ ...NONE, sleepNightsTracked: 1, sleepNightsUnder6: 1 })
    expect(t.real).toBe(false)
  })

  it('builds a REAL sleep teaser from a real run of short nights', () => {
    const t = buildVentTeaser({ ...NONE, sleepNightsTracked: 7, sleepNightsUnder6: 5 })
    expect(t.real).toBe(true)
    expect(t.vee).toContain('5 of the last 7 nights')
    expect(t.emphasis && t.vee.includes(t.emphasis)).toBe(true)
  })

  it('builds a REAL recovery teaser on a genuine dip', () => {
    const t = buildVentTeaser({ ...NONE, latestRecovery: 33 })
    expect(t.real).toBe(true)
    expect(t.vee).toContain('33')
  })

  it('does NOT flag a healthy recovery', () => {
    const t = buildVentTeaser({ ...NONE, latestRecovery: 72 })
    expect(t.real).toBe(false)
  })

  it('builds a REAL training-load teaser on a heavy week', () => {
    const t = buildVentTeaser({ ...NONE, sessionsDone7d: 6 })
    expect(t.real).toBe(true)
    expect(t.vee).toContain('6 times')
  })

  it('prioritises sleep over recovery over training when several are true', () => {
    const t = buildVentTeaser({ sleepNightsTracked: 7, sleepNightsUnder6: 3, latestRecovery: 30, sessionsDone7d: 6 })
    expect(t.vee).toContain('sleep')
  })

  it('the emphasis is always a real substring of the reply', () => {
    for (const s of [
      { ...NONE, sleepNightsTracked: 5, sleepNightsUnder6: 2 },
      { ...NONE, latestRecovery: 20 },
      { ...NONE, sessionsDone7d: 5 },
    ]) {
      const t = buildVentTeaser(s)
      expect(t.emphasis).toBeTruthy()
      expect(t.vee.includes(t.emphasis as string)).toBe(true)
    }
  })
})

import {
  keOf,
  kaFromTmax,
  bateman,
  batemanPeak,
  personalT12,
  intensity,
  pkProfile,
  feltEffect,
  type StackProfile,
} from '@/lib/peak/stackEngine'
import { STACK_BY_ID, findSubstance, STACK_DB } from '@/lib/peak/stackLibrary'

const p: StackProfile = { weightKg: 75, age: 24, sex: 'male' }

describe('keOf', () => {
  it('is ln2 / half-life', () => {
    expect(keOf(5)).toBeCloseTo(Math.LN2 / 5, 6)
  })
})

describe('bateman / kaFromTmax', () => {
  it('peaks at the substance tmax that ka was solved for', () => {
    const ke = keOf(5)
    const tmax = 0.75
    const ka = kaFromTmax(tmax, ke)
    // The analytic peak time of the Bateman curve is ln(ka/ke)/(ka-ke).
    const peakT = Math.log(ka / ke) / (ka - ke)
    expect(peakT).toBeCloseTo(tmax, 2)
  })

  it('is zero at/under t=0 and positive after', () => {
    const ke = keOf(5)
    const ka = kaFromTmax(0.75, ke)
    expect(bateman(0, ka, ke)).toBe(0)
    expect(bateman(-1, ka, ke)).toBe(0)
    expect(bateman(1, ka, ke)).toBeGreaterThan(0)
  })

  it('batemanPeak is the maximum of the curve', () => {
    const ke = keOf(5)
    const ka = kaFromTmax(0.75, ke)
    const peak = batemanPeak(ka, ke)
    for (const t of [0.1, 0.5, 0.75, 1, 2, 5]) {
      expect(bateman(t, ka, ke)).toBeLessThanOrEqual(peak + 1e-9)
    }
  })
})

describe('personalT12', () => {
  const caffeine = STACK_BY_ID['caffeine']
  it('leaves a baseline (age 24, male, non-smoker) unchanged', () => {
    expect(personalT12(caffeine, p)).toBeCloseTo(caffeine.t12, 6)
  })
  it('lengthens with age over 40', () => {
    expect(personalT12(caffeine, { ...p, age: 60 })).toBeGreaterThan(caffeine.t12)
  })
  it('is slightly longer for female', () => {
    expect(personalT12(caffeine, { ...p, sex: 'female' })).toBeCloseTo(caffeine.t12 * 1.05, 6)
  })
  it('shortens for a smoker on a CYP1A2 substrate', () => {
    expect(personalT12(caffeine, { ...p, smokes: true })).toBeCloseTo(caffeine.t12 * 0.62, 6)
  })
  it('ignores smoking for a non-CYP1A2 substance', () => {
    const adderall = STACK_BY_ID['adderall-ir']
    expect(personalT12(adderall, { ...p, smokes: true })).toBeCloseTo(adderall.t12, 6)
  })
})

describe('intensity', () => {
  it('is 1.0 at the 70kg reference and clamps at the extremes', () => {
    expect(intensity({ ...p, weightKg: 70 })).toBeCloseTo(1, 6)
    expect(intensity({ ...p, weightKg: 30 })).toBeCloseTo(1.6, 6) // floor uses max(40,w)
    expect(intensity({ ...p, weightKg: 200 })).toBeCloseTo(0.6, 6)
  })
  it('a lighter person feels more than a heavier one', () => {
    expect(intensity({ ...p, weightKg: 55 })).toBeGreaterThan(intensity({ ...p, weightKg: 95 }))
  })
})

describe('pkProfile', () => {
  it('orders the timing markers onset < peak < comeStart < comeEnd < cleared', () => {
    const pk = pkProfile(STACK_BY_ID['caffeine'], p)
    expect(pk.onset).toBeLessThan(pk.peak)
    expect(pk.peak).toBeLessThan(pk.comeStart)
    expect(pk.comeStart).toBeLessThan(pk.comeEnd)
    expect(pk.comeEnd).toBeLessThanOrEqual(pk.cleared)
  })
  it('rel is 0 at dose, ~1 at peak, and decays toward 0', () => {
    const pk = pkProfile(STACK_BY_ID['caffeine'], p)
    expect(pk.rel(0)).toBe(0)
    expect(pk.rel(pk.peak)).toBeCloseTo(1, 2)
    expect(pk.rel(24)).toBeLessThan(0.1)
  })
  it('a longer-half-life substance clears later', () => {
    const caffeine = pkProfile(STACK_BY_ID['caffeine'], p) // t½ 5h
    const armodafinil = pkProfile(STACK_BY_ID['armodafinil'], p) // t½ 14h
    expect(armodafinil.cleared).toBeGreaterThan(caffeine.cleared)
  })
})

describe('feltEffect', () => {
  it('is 0 for a steady-state med (peakFeel 0)', () => {
    expect(feltEffect(STACK_BY_ID['sertraline'], p, 6)).toBe(0)
  })
  it('peaks near tmax and scales with dose', () => {
    const caffeine = STACK_BY_ID['caffeine']
    const atPeak = feltEffect(caffeine, p, caffeine.tmax)
    const later = feltEffect(caffeine, p, caffeine.tmax + 8)
    expect(atPeak).toBeGreaterThan(later)
    const doubleDose = feltEffect(caffeine, p, caffeine.tmax, caffeine.doseMg * 2)
    expect(doubleDose).toBeCloseTo(atPeak * 2, 5)
  })
})

describe('findSubstance', () => {
  it('resolves ids, names and aliases case-insensitively', () => {
    expect(findSubstance('caffeine')?.id).toBe('caffeine')
    expect(findSubstance('Zyn')?.id).toBe('nicotine')
    expect(findSubstance('lexapro')?.id).toBe('escitalopram')
    expect(findSubstance('addy')?.id).toBe('adderall-ir')
  })
  it('returns null for nonsense', () => {
    expect(findSubstance('xyzzy123')).toBeNull()
  })
  it('every catalog entry has the PK fields the engine needs', () => {
    for (const s of STACK_DB) {
      expect(s.t12).toBeGreaterThan(0)
      expect(s.tmax).toBeGreaterThan(0)
    }
  })
})

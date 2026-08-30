import { buildSetupWrites } from '@/app/app/fitness/setup/setupWrites'
import type { PresetDay } from '@/app/app/fitness/setup/presets'

const days = [
  {
    day: 1, name: 'Push', type: 'HEAVY', category: 'push',
    exercises: [
      { id: 'bench_bb', sets: 5, reps: 5, weightKg: 62.5, restSec: 180, tuned: true },
      { id: 'ohp', sets: 3, reps: 8 },
    ],
  },
] as unknown as PresetDay[]

describe('buildSetupWrites', () => {
  const r = buildSetupWrites(days, 80, 'M', 'intermediate')

  it('keeps a plain-id estimate for every lift (untuned default path)', () => {
    expect(typeof r.recommendedWeights['ohp']).toBe('number')
    expect(typeof r.recommendedWeights['bench_bb']).toBe('number')
  })

  it('adds a scoped override for the tuned lift, keyed exId__dayType', () => {
    expect(r.recommendedWeights['bench_bb__HEAVY']).toBe(62.5)
  })

  it('writes rest_overrides ONLY for tuned lifts, keyed exId__dayType', () => {
    expect(r.restOverrides['bench_bb__HEAVY']).toBe(180)
    expect('ohp__HEAVY' in r.restOverrides).toBe(false)
  })

  it('does not write a scoped weight for untuned lifts', () => {
    expect('ohp__HEAVY' in r.recommendedWeights).toBe(false)
  })
})

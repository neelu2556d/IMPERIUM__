import { scoreDrivers, marketSignals, improvementTips } from '@/app/app/peak/curve'
import type { SubstanceLog, WhoopSignal } from '@/app/app/peak/types'

// No wearable, no logs — exercises the baseline branches.
const NO_WHOOP = {} as WhoopSignal

function hydrationDriver(logs: SubstanceLog[], waterCount: number) {
  return scoreDrivers(NO_WHOOP, logs, waterCount).drivers.find(d => d.key === 'hydration')!
}

describe('Peak hydration reads the shared water count, not Peak logs', () => {
  test('hydration driver is 0 / idle when no water', () => {
    const d = hydrationDriver([], 0)
    expect(d.value).toBe(0)
    expect(d.tone).toBe('idle')
  })

  test('hydration driver scales 2 points per serving', () => {
    expect(hydrationDriver([], 3).value).toBe(6)
  })

  test('hydration driver caps at +8', () => {
    expect(hydrationDriver([], 10).value).toBe(8)
  })

  test('hydration ignores water logged into Peak state (no double count)', () => {
    const legacyWater = { id: 'x', key: 'water', takenAt: 0, dose: 8, tolerance: 0 } as SubstanceLog
    // waterCount is the only source now — a stray Peak water log must not count.
    expect(hydrationDriver([legacyWater], 0).value).toBe(0)
  })

  test('marketSignals HYDRATION reflects the passed count', () => {
    const sig = marketSignals(NO_WHOOP, 5).find(s => s.label === 'HYDRATION')!
    expect(sig.value).toBe('5')
  })

  test('improvementTips shows Drink water below 4, hides it at/above 4', () => {
    const below = improvementTips(NO_WHOOP, [], 0).some(t => t.label === 'Drink water')
    const at = improvementTips(NO_WHOOP, [], 4).some(t => t.label === 'Drink water')
    expect(below).toBe(true)
    expect(at).toBe(false)
  })
})

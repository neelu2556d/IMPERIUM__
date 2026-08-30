import { mlToUnits } from '@/app/app/fuel/water/state'
import type { WaterState } from '@/app/app/fuel/water/types'

const st = (over: Partial<WaterState> = {}): WaterState =>
  ({ unit: 'glass', glassMl: 250, bottleMl: 500, logs: {}, ...over } as WaterState)

describe('mlToUnits', () => {
  test('a 470 ml pour ≈ 2 glasses', () => {
    expect(mlToUnits(470, st())).toBe(2)
  })
  test('rounds to nearest unit, min 1 for any positive ml', () => {
    expect(mlToUnits(100, st())).toBe(1)
    expect(mlToUnits(500, st({ unit: 'bottle' }))).toBe(1)
    expect(mlToUnits(330, st({ unit: 'bottle' }))).toBe(1)
  })
  test('0 / negative ml → 0', () => {
    expect(mlToUnits(0, st())).toBe(0)
    expect(mlToUnits(-5, st())).toBe(0)
  })
})

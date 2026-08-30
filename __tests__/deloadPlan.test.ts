import {
  easeSets,
  easeWeightKg,
  buildOffDayPlan,
  RIR_COPY,
  OFF_HEADNOTE,
  OFF_BADGE,
  type OffDayLift,
} from '@/app/app/fitness/log/offDayPlan'

describe('deload plan math', () => {
  test('cuts compound sets ~half with a floor of 2', () => {
    expect(easeSets('deload', true, 4)).toBe(2)
    expect(easeSets('deload', true, 5)).toBe(3)
    expect(easeSets('deload', true, 3)).toBe(2) // round(1.5)=2, floor 2
    expect(easeSets('deload', true, 2)).toBe(2) // never below the floor
  })

  test('cuts isolation sets ~half with a floor of 1', () => {
    expect(easeSets('deload', false, 4)).toBe(2)
    expect(easeSets('deload', false, 2)).toBe(1)
    expect(easeSets('deload', false, 1)).toBe(1) // already minimal
  })

  test('drops load ~10%, snapped to 2.5kg', () => {
    expect(easeWeightKg('deload', true, 80)).toBe(72.5) // 72 -> 72.5
    expect(easeWeightKg('deload', false, 100)).toBe(90)
    expect(easeWeightKg('deload', true, 0)).toBe(0) // bodyweight stays 0
  })

  test('never eases ABOVE the base load or reps, reps target unchanged', () => {
    const lifts: OffDayLift[] = [
      { id: 'bench', name: 'Bench', compound: true, sets: 4, reps: 5, baseKg: 80 },
      { id: 'curl', name: 'Curl', compound: false, sets: 3, reps: 12, baseKg: 20 },
    ]
    const plan = buildOffDayPlan('deload', lifts)
    expect(plan.bench.kg).toBeLessThan(80)
    expect(plan.bench.sets).toBeLessThan(4)
    expect(plan.bench.reps).toBe(5) // reps unchanged — you stop short via RIR
    expect(plan.curl.kg).toBeLessThan(20)
    expect(plan.curl.reps).toBe(12)
  })

  test('a lift with no history borrows a same-tier peer base (never 0)', () => {
    const lifts: OffDayLift[] = [
      { id: 'bench', name: 'Bench', compound: true, sets: 4, reps: 5, baseKg: 80 },
      { id: 'newlift', name: 'New', compound: true, sets: 3, reps: 8, baseKg: 0 },
    ]
    const plan = buildOffDayPlan('deload', lifts)
    expect(plan.newlift.kg).toBeGreaterThan(0)
  })

  test('deload copy is defined for every surface', () => {
    expect(RIR_COPY.deload).toMatch(/3 to 4/)
    expect(OFF_HEADNOTE.deload).toBeTruthy()
    expect(OFF_BADGE.deload).toBe('deload')
  })
})

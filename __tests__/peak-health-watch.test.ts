import { buildHealthWatch, caffeineActiveAt, CAFF_CEILING } from '@/app/app/peak/healthWatchModel'
import type { SubstanceLog, WhoopSignal, ManualVitals } from '@/app/app/peak/types'

// A fixed clock so takenAt-hour math is deterministic.
const at = (hour: number, dose: number, key = 'coffee', tolerance = 5): SubstanceLog => {
  const d = new Date(2026, 5, 21, Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
  return { id: `${key}-${hour}`, key, takenAt: d.getTime(), dose, tolerance }
}

const NO_WHOOP: WhoopSignal = {
  recovery: null, hrv: null, sleepScore: null, sleepHours: null, sleepDebtHours: null,
  strain: null, wakeHour: null, hrvBaseline: null, rhrBaseline: null, hrvAnomalous: false,
  daysAvailable: 0,
} as WhoopSignal

describe('buildHealthWatch — real-data load monitor', () => {
  test('no logs, no vitals → healthy range, zero caffeine', () => {
    const r = buildHealthWatch({ logs: [], whoop: NO_WHOOP, manual: null })
    expect(r.severity).toBe(0)
    expect(r.caffMg).toBe(0)
    expect(r.signals).toHaveLength(0)
    expect(r.caffCeiling).toBe(CAFF_CEILING)
  })

  test('sums real caffeine doses across sources', () => {
    const r = buildHealthWatch({
      logs: [at(8, 95, 'coffee'), at(10, 160, 'energy_drink'), at(11, 75, 'espresso')],
      whoop: NO_WHOOP, manual: null,
    })
    expect(r.caffMg).toBe(330)
    expect(r.caffeineSources).toBe(3)
    // 3 distinct sources → caution
    expect(r.severity).toBe(1)
    expect(r.signals.some(s => /stacked 3 different/.test(s.text))).toBe(true)
  })

  test('over 400 mg → caution; over 600 mg → alert', () => {
    const over = buildHealthWatch({ logs: [at(8, 250, 'coffee'), at(9, 200, 'coffee')], whoop: NO_WHOOP, manual: null })
    expect(over.caffMg).toBe(450)
    expect(over.severity).toBe(1)

    const way = buildHealthWatch({ logs: [at(8, 400, 'coffee'), at(9, 300, 'coffee')], whoop: NO_WHOOP, manual: null })
    expect(way.severity).toBe(2)
    expect(way.signals.some(s => s.level === 2)).toBe(true)
  })

  test('late caffeine still active at bedtime is flagged with a real mg estimate', () => {
    // 200mg at 9pm → ~6.6h before 11pm bedtime? no: 2h decay → 200*0.5^(2/5) ≈ 151mg
    const r = buildHealthWatch({ logs: [at(21, 200, 'coffee')], whoop: NO_WHOOP, manual: null })
    expect(r.caffAtBedtime).toBeGreaterThan(50)
    expect(r.signals.some(s => /active around bedtime/.test(s.text))).toBe(true)
    expect(r.shortEffects).toContain('Trouble falling asleep tonight')
  })

  test('caffeine masking real WHOOP sleep debt fires', () => {
    const whoop = { ...NO_WHOOP, sleepDebtHours: 2.5 }
    const r = buildHealthWatch({ logs: [at(8, 200, 'coffee')], whoop, manual: null })
    expect(r.sleepDebtH).toBe(2.5)
    expect(r.signals.some(s => /masking 2\.5h of sleep debt/.test(s.text))).toBe(true)
  })

  test('elevated resting HR vs baseline + caffeine load fires', () => {
    const whoop = { ...NO_WHOOP, rhrBaseline: 50 }
    const manual = { rhr: 60 } as ManualVitals // 60 > 50*1.1=55
    const r = buildHealthWatch({ logs: [at(8, 250, 'coffee')], whoop, manual })
    expect(r.signals.some(s => /Resting HR 60/.test(s.text))).toBe(true)
  })

  test('alcohol logged is flagged', () => {
    const r = buildHealthWatch({ logs: [at(20, 1, 'alcohol')], whoop: NO_WHOOP, manual: null })
    expect(r.signals.some(s => /Alcohol logged/.test(s.text))).toBe(true)
    expect(r.longEffects.some(e => /Suppressed recovery/.test(e))).toBe(true)
  })

  test('caffeineActiveAt decays by the 5h half-life', () => {
    // one 200mg dose at hour 18, measured at hour 23 (5h later) → exactly half
    const log = [at(18, 200, 'coffee')]
    expect(Math.round(caffeineActiveAt(log, 23))).toBe(100)
  })
})

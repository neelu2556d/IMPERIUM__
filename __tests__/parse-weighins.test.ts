import { parseWeighInsText, kgFromValue } from '@/lib/nutrition/parseWeighIns'

// Fixed "today" so undated/relative rows are deterministic.
const TODAY = new Date(2026, 5, 21) // Jun 21 2026, local

describe('parseWeighInsText', () => {
  test('ISO dates + kg', () => {
    const r = parseWeighInsText('2026-06-01 75.4 kg\n2026-06-08 75.0\n2026-06-15 74.6', { today: TODAY })
    expect(r.unit).toBe('kg')
    expect(r.rows).toEqual([
      { dayKey: '2026-06-01', value: 75.4 },
      { dayKey: '2026-06-08', value: 75.0 },
      { dayKey: '2026-06-15', value: 74.6 },
    ])
    expect(r.skipped).toEqual([])
  })

  test('mixed real-world formats all parse', () => {
    const r = parseWeighInsText('2026-06-01  75.4 kg\nJun 8, 75.0\n6/15/26  74.6\nJune 18 2026 74.4', { today: TODAY })
    expect(r.rows.map((x) => x.dayKey)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-18'])
    expect(r.rows.map((x) => x.value)).toEqual([75.4, 75.0, 74.6, 74.4])
  })

  test('weight is the LAST plausible number, not the day/month', () => {
    const r = parseWeighInsText('Jun 8, 75.0', { today: TODAY })
    expect(r.rows[0]).toEqual({ dayKey: '2026-06-08', value: 75.0 }) // not 8
  })

  test('lb is detected and kept as raw lb (converted only via kgFromValue)', () => {
    const r = parseWeighInsText('2026-06-01 165 lb\n2026-06-08 164 lbs', { today: TODAY })
    expect(r.unit).toBe('lb')
    expect(r.rows[0].value).toBe(165)
    expect(kgFromValue(r.rows[0].value, r.unit)).toBeCloseTo(74.84, 1)
  })

  test('a bare column of numbers → consecutive days ending today, newest last', () => {
    const r = parseWeighInsText('75.2\n75.0\n74.8\n74.5', { today: TODAY })
    expect(r.rows.map((x) => x.dayKey)).toEqual(['2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'])
    expect(r.rows.at(-1)).toEqual({ dayKey: '2026-06-21', value: 74.5 })
  })

  test('unreadable lines are skipped, not crashed on', () => {
    const r = parseWeighInsText('2026-06-01 75.4\nthis line has no weight\n2026-06-02 75.1', { today: TODAY })
    expect(r.rows).toHaveLength(2)
    expect(r.skipped).toEqual(['this line has no weight'])
  })

  test('duplicate days dedupe — last one wins', () => {
    const r = parseWeighInsText('2026-06-01 75.4\n2026-06-01 75.9', { today: TODAY })
    expect(r.rows).toEqual([{ dayKey: '2026-06-01', value: 75.9 }])
  })

  test('rows come back sorted oldest → newest', () => {
    const r = parseWeighInsText('2026-06-15 74.6\n2026-06-01 75.4\n2026-06-08 75.0', { today: TODAY })
    expect(r.rows.map((x) => x.dayKey)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15'])
  })

  test('JSON array export', () => {
    const json = JSON.stringify([
      { date: '2026-06-01', weight: 75.4 },
      { date: '2026-06-08', kg: 75.0 },
    ])
    const r = parseWeighInsText(json, { today: TODAY })
    expect(r.rows).toEqual([
      { dayKey: '2026-06-01', value: 75.4 },
      { dayKey: '2026-06-08', value: 75.0 },
    ])
  })

  test('D/M/Y is recovered when the first field cannot be a month', () => {
    const r = parseWeighInsText('15/6/26 74.6', { today: TODAY })
    expect(r.rows[0].dayKey).toBe('2026-06-15')
  })

  test('a no-year month-date in the future is read as last year', () => {
    // "Dec 30" with today = Jun 2026 would be future → 2025
    const r = parseWeighInsText('Dec 30 74.0', { today: TODAY })
    expect(r.rows[0].dayKey).toBe('2025-12-30')
  })

  test('unitHint forces interpretation when no token present', () => {
    const r = parseWeighInsText('2026-06-01 165\n2026-06-08 164', { unitHint: 'lb', today: TODAY })
    expect(r.unit).toBe('lb')
    expect(r.rows).toHaveLength(2)
  })

  test('empty / whitespace → empty result, no throw', () => {
    expect(parseWeighInsText('', { today: TODAY })).toEqual({ rows: [], unit: 'kg', skipped: [] })
    expect(parseWeighInsText('   \n  ', { today: TODAY }).rows).toEqual([])
  })
})

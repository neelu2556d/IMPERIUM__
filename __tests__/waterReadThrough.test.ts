import { mergeWaterLogs } from '@/app/app/fuel/water/state'

/**
 * Water read-through (the Phase 0 enabling fix for "Vitality, I'm home"):
 * day logs from this browser and the Supabase mirror merge per-day by MAX,
 * so neither a debounce-lost drink (local ahead) nor another device's days
 * (server ahead) are ever dropped.
 */
describe('mergeWaterLogs: local + server day logs merge per-day by max', () => {
  test('server days unknown locally are adopted (new phone / cleared cache)', () => {
    expect(mergeWaterLogs({}, { '2026-07-01': 5, '2026-07-02': 3 })).toEqual({
      '2026-07-01': 5,
      '2026-07-02': 3,
    })
  })

  test('local wins when ahead of the debounced mirror', () => {
    expect(mergeWaterLogs({ '2026-07-03': 6 }, { '2026-07-03': 4 })).toEqual({ '2026-07-03': 6 })
  })

  test('server wins when it knows more (logged on another device)', () => {
    expect(mergeWaterLogs({ '2026-07-03': 2 }, { '2026-07-03': 7 })).toEqual({ '2026-07-03': 7 })
  })

  test('disjoint days union', () => {
    expect(mergeWaterLogs({ '2026-07-01': 1 }, { '2026-07-02': 2 })).toEqual({
      '2026-07-01': 1,
      '2026-07-02': 2,
    })
  })

  test('empty server mirror leaves local untouched', () => {
    expect(mergeWaterLogs({ '2026-07-03': 3 }, {})).toEqual({ '2026-07-03': 3 })
  })

  test('junk server counts are ignored', () => {
    expect(
      mergeWaterLogs({ '2026-07-03': 3 }, { '2026-07-03': NaN as unknown as number }),
    ).toEqual({ '2026-07-03': 3 })
  })

  test('does not mutate its inputs', () => {
    const local = { '2026-07-01': 1 }
    const server = { '2026-07-01': 2 }
    mergeWaterLogs(local, server)
    expect(local).toEqual({ '2026-07-01': 1 })
    expect(server).toEqual({ '2026-07-01': 2 })
  })
})

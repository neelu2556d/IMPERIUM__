import { getPeakStimulants, getStimulantsDaily, getManualSleepDaily } from '@/mcp/src/queries'
import { getLocalDateKey } from '@/mcp/src/util'
import type { VitalityDb } from '@/mcp/src/supabase'

// Read layer for the peak-stimulants MCP tool. getPeakStimulants reads the
// `peak_state` jsonb blob the Peak module mirrors (substances enriched with
// name/category/unit at sync time) and surfaces today's stimulant log + caffeine
// total + the latest subjective energy tap. These pin the today-filter, the
// caffeine sum, and the 24h energy window.

const HOUR = 3_600_000
const DAY = 86_400_000
// A fixed clock-free "today" entry: now. (Date.now() is real in jest.)
const now = () => Date.now()

function vdbWithPeakBlob(blob: unknown): VitalityDb {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = async () => ({ data: blob == null ? null : { data: blob }, error: null })
  return { db: { from: () => builder }, userId: 'u1', mode: 'user', scopes: ['mcp:read'] } as unknown as VitalityDb
}

describe('getPeakStimulants', () => {
  test('no peak_state row → no data', async () => {
    const s = await getPeakStimulants(vdbWithPeakBlob(null))
    expect(s.hasData).toBe(false)
    expect(s.todayCount).toBe(0)
    expect(s.caffeineMgToday).toBeNull()
  })

  test("sums today's caffeine, excludes earlier days, keeps non-caffeine in the count", async () => {
    const blob = {
      profile: { tolerance: 6 },
      substances: [
        { id: 's1', key: 'coffee', name: 'Coffee', category: 'caffeine', unit: 'mg', dose: 95, takenAt: now() - HOUR },
        { id: 's2', key: 'energy_drink', name: 'Energy drink', category: 'caffeine', unit: 'mg', dose: 160, takenAt: now() - 2 * HOUR },
        { id: 's3', key: 'nicotine', name: 'Nicotine', category: 'nicotine', unit: 'mg', dose: 4, takenAt: now() - HOUR },
        { id: 's4', key: 'coffee', name: 'Coffee', category: 'caffeine', unit: 'mg', dose: 95, takenAt: now() - 2 * DAY }, // an earlier day
      ],
      taps: [],
    }
    const s = await getPeakStimulants(vdbWithPeakBlob(blob))
    expect(s.hasData).toBe(true)
    expect(s.todayCount).toBe(3) // 2 caffeine + 1 nicotine today; the 2-day-old coffee excluded
    expect(s.caffeineMgToday).toBe(255) // 95 + 160
    expect(s.tolerance).toBe(6)
    expect(s.substances.map((x) => x.name)).toContain('Energy drink')
  })

  test('caffeineMgToday is null when nothing logged carries caffeine', async () => {
    const blob = { substances: [{ id: 's1', key: 'nicotine', name: 'Nicotine', category: 'nicotine', dose: 4, takenAt: now() }], taps: [] }
    const s = await getPeakStimulants(vdbWithPeakBlob(blob))
    expect(s.todayCount).toBe(1)
    expect(s.caffeineMgToday).toBeNull()
  })

  test('surfaces the latest subjective energy tap within 24h, ignores older', async () => {
    const recent = { substances: [], taps: [{ id: 't1', value: -50, time: now() - 30 * HOUR }, { id: 't2', value: 40, time: now() - 2 * HOUR }] }
    const s = await getPeakStimulants(vdbWithPeakBlob(recent))
    expect(s.latestEnergy?.value).toBe(40)
    expect(s.hasData).toBe(true) // an energy reading alone counts as data

    const stale = { substances: [], taps: [{ id: 't1', value: 40, time: now() - 30 * HOUR }] }
    const s2 = await getPeakStimulants(vdbWithPeakBlob(stale))
    expect(s2.latestEnergy).toBeNull()
    expect(s2.hasData).toBe(false)
  })
})

describe('getStimulantsDaily (caffeine history for the caffeine→recovery seam)', () => {
  test('no peak_state row → empty history', async () => {
    expect(await getStimulantsDaily(vdbWithPeakBlob(null), 30)).toEqual([])
  })

  test('aggregates caffeine mg per day across the window, excludes non-caffeine', async () => {
    const blob = {
      substances: [
        { id: 'a', category: 'caffeine', dose: 95, takenAt: now() - HOUR },
        { id: 'b', category: 'caffeine', dose: 160, takenAt: now() - 2 * HOUR },
        { id: 'c', category: 'nicotine', dose: 4, takenAt: now() - HOUR }, // not caffeine — contributes 0 mg
        { id: 'd', category: 'caffeine', dose: 95, takenAt: now() - 5 * DAY },
      ],
      taps: [],
    }
    const days = await getStimulantsDaily(vdbWithPeakBlob(blob), 30)
    // 95 + 160 (today) + 95 (5 days ago); nicotine adds nothing.
    expect(days.reduce((s, d) => s + d.caffeineMg, 0)).toBe(350)
    // At least two distinct days (today + the 5-day-old day); only caffeine days emitted.
    expect(days.length).toBeGreaterThanOrEqual(2)
    expect(days.every((d) => d.caffeineMg > 0)).toBe(true)
  })

  test('respects the day window — drops caffeine older than `days`', async () => {
    const blob = {
      substances: [
        { id: 'a', category: 'caffeine', dose: 100, takenAt: now() - HOUR },
        { id: 'b', category: 'caffeine', dose: 200, takenAt: now() - 10 * DAY },
      ],
      taps: [],
    }
    const recent = await getStimulantsDaily(vdbWithPeakBlob(blob), 3)
    expect(recent.reduce((s, d) => s + d.caffeineMg, 0)).toBe(100) // 10-day-old is outside a 3-day window
  })
})

describe('getManualSleepDaily (no-wearable sleep history for the sleep→mood seam, BUILD62)', () => {
  const dayKey = (offset: number) => getLocalDateKey(new Date(now() - offset * DAY))

  test('no peak_state row → empty history', async () => {
    expect(await getManualSleepDaily(vdbWithPeakBlob(null), 30)).toEqual([])
  })

  test('emits days with logged sleep hours (newest first), skips days without sleep', async () => {
    const blob = {
      manual: {
        [dayKey(0)]: { sleepHours: 7.5, energy: 3, updatedAt: now() },
        [dayKey(1)]: { sleepHours: 6, updatedAt: now() },
        [dayKey(2)]: { energy: 4, updatedAt: now() }, // no sleepHours → skipped
      },
    }
    const days = await getManualSleepDaily(vdbWithPeakBlob(blob), 30)
    expect(days.map((d) => d.sleepHours)).toEqual([7.5, 6])
    expect(days[0].date).toBe(dayKey(0))
  })

  test('respects the day window — drops sleep older than `days`', async () => {
    const blob = {
      manual: {
        [dayKey(0)]: { sleepHours: 7, updatedAt: now() },
        [dayKey(10)]: { sleepHours: 8, updatedAt: now() },
      },
    }
    const recent = await getManualSleepDaily(vdbWithPeakBlob(blob), 3)
    expect(recent.map((d) => d.sleepHours)).toEqual([7]) // the 10-day-old day is outside a 3-day window
  })
})

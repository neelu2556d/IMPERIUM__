import { buildTrainGraphs, buildFuelGraphs, buildBodyGraphs, buildVitalsGraphs } from '@/lib/insights/coreRoom'

/**
 * THE CORE ROOM's brain is pure: raw rows in, plotted series out, no IO.
 * These tests pin the honesty rules: off-days never dent a line, unlogged
 * sets never count, day totals sum correctly, and nulls simply vanish.
 */

const set = (weight: number, reps: number, done = true, failed = false) => ({ weight, reps, done, failed })

describe('buildTrainGraphs', () => {
  const workouts = [
    {
      date: '2026-07-01',
      exercises: [
        { id: 'bench_bb', name: 'Bench Press', sets: [set(80, 8), set(85, 5), set(90, 1, true, true)] },
        { id: 'row_bb', name: 'Barbell Row', sets: [set(70, 10)] },
      ],
    },
    {
      date: '2026-07-03',
      exercises: [{ id: 'bench_bb', name: 'Bench Press', sets: [set(87.5, 5), set(0, 5), set(80, 8, false)] }],
    },
    // An off-day session must never appear in any line.
    {
      date: '2026-07-05',
      off_day: 'deload',
      exercises: [{ id: 'bench_bb', name: 'Bench Press', sets: [set(40, 20)] }],
    },
  ]

  const graphs = buildTrainGraphs(workouts)
  const byId = (id: string) => graphs.find((g) => g.id === id)!

  it('draws one top-set line per lift, skipping failed/unlogged sets and off-days', () => {
    const bench = byId('lift_top_bench_bb')
    expect(bench.label).toBe('Bench Press')
    expect(bench.points).toEqual([
      { date: '2026-07-01', value: 85 }, // the failed 90 never counts
      { date: '2026-07-03', value: 87.5 }, // the 0kg and un-done sets never count
    ])
  })

  it('draws a volume line per lift (weight x reps of logged sets)', () => {
    const vol = byId('lift_vol_bench_bb')
    expect(vol.points[0]).toEqual({ date: '2026-07-01', value: 80 * 8 + 85 * 5 })
  })

  it('draws the whole-session series', () => {
    const sv = byId('session_volume')
    expect(sv.points.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-03'])
    const sets = byId('session_sets')
    expect(sets.points[0].value).toBe(3) // 2 bench + 1 row logged sets on day one
  })

  it('orders lifts by how often they are trained', () => {
    const liftIds = graphs.filter((g) => g.id.startsWith('lift_top_')).map((g) => g.id)
    expect(liftIds[0]).toBe('lift_top_bench_bb') // 2 sessions beats 1
  })
})

describe('buildFuelGraphs', () => {
  const meals = [
    { day_key: '2026-07-01', totals: { kcal: 600, protein: 40, carbs: 50, fat: 20 } },
    { day_key: '2026-07-01', totals: { kcal: 800, protein: 50, carbs: 70, fat: 30 } },
    { day_key: '2026-07-02', totals: { kcal: 500, protein: 35, carbs: 40, fat: 15 } },
    { day_key: '2026-07-02', totals: 'garbage' }, // hostile totals: counts the meal, adds nothing
  ]
  const water = [
    { date: '2026-07-01', amount_ml: 500 },
    { date: '2026-07-01', amount_ml: 750 },
    { date: '2026-07-02', amount_ml: null },
  ]
  const graphs = buildFuelGraphs(meals, water)
  const byId = (id: string) => graphs.find((g) => g.id === id)!

  it('sums each day and never trusts a hostile totals payload', () => {
    expect(byId('kcal').points).toEqual([
      { date: '2026-07-01', value: 1400 },
      { date: '2026-07-02', value: 500 },
    ])
    expect(byId('meals_logged').points[1].value).toBe(2)
  })

  it('sums water per day, skipping nulls', () => {
    expect(byId('water').points).toEqual([{ date: '2026-07-01', value: 1250 }])
  })
})

describe('buildBodyGraphs', () => {
  it('draws raw weigh-ins plus the 7-day story', () => {
    const weights = [
      { date: '2026-07-01', weight_kg: 80 },
      { date: '2026-07-02', weight_kg: 82 },
      { date: '2026-07-03', weight_kg: null },
      { date: '2026-07-04', weight_kg: 81 },
    ]
    const [raw, avg] = buildBodyGraphs(weights)
    expect(raw.points.length).toBe(3)
    expect(avg.points[2].value).toBe(81) // (80+82+81)/3
  })
})

describe('buildVitalsGraphs', () => {
  it('one line per vital, nulls vanish, catalog is always complete', () => {
    const rows = [
      { date: '2026-07-01', recovery: 88, strain: 12.4, sleep_hours: 7.2, sleep_perf: null, hrv: 65, rhr: 52 },
      { date: '2026-07-02', recovery: null, strain: null, sleep_hours: 6.1, sleep_perf: null, hrv: null, rhr: null },
    ]
    const graphs = buildVitalsGraphs(rows)
    expect(graphs).toHaveLength(6)
    expect(graphs.find((g) => g.id === 'sleep_hours')!.points).toHaveLength(2)
    expect(graphs.find((g) => g.id === 'sleep_perf')!.points).toHaveLength(0) // honest empty card
  })
})

describe('buildFuelGraphs food score', () => {
  const meals = [
    { day_key: '2026-07-01', totals: { kcal: 2000, protein: 150 } },
    { day_key: '2026-07-02', totals: { kcal: 2000, protein: 150 } },
  ]
  it('draws a real 0-10 food score when a fuel target exists', () => {
    const g = buildFuelGraphs(meals, [], { kcal: 2000, protein: 150 }).find((x) => x.id === 'food_score')!
    expect(g.soon).toBeUndefined()
    expect(g.points.length).toBe(2)
    expect(g.points[0].value).toBe(10) // hit protein + calories exactly
    expect(g.unit).toBe('/10')
  })
  it('stays dim (soon) when there is no fuel target', () => {
    const g = buildFuelGraphs(meals, []).find((x) => x.id === 'food_score')!
    expect(g.soon).toBe(true)
    expect(g.points.length).toBe(0)
  })
})

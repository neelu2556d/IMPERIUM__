import { weeklyWeightRate, buildTicker, type TickerInput } from '@/lib/insights/ticker'

const BASE: TickerInput = { goals: [], weighIns: [], goalDirection: null, workoutDatesLast21: [], lifts: [] }

const benchSessions = (weights: number[]) =>
  weights.map((w, i) => ({ date: `2026-05-${String(1 + i * 7).padStart(2, '0')}`, topWeight: w }))

describe('weeklyWeightRate', () => {
  it('returns null with fewer than two weigh-ins', () => {
    expect(weeklyWeightRate([])).toBeNull()
    expect(weeklyWeightRate([{ date: '2026-06-01', kg: 80 }])).toBeNull()
  })

  it('returns null when every weigh-in is on the same day (no slope)', () => {
    expect(weeklyWeightRate([
      { date: '2026-06-01', kg: 80 },
      { date: '2026-06-01', kg: 79 },
    ])).toBeNull()
  })

  it('measures a downward series as negative kg per week', () => {
    const r = weeklyWeightRate([
      { date: '2026-06-01', kg: 80 },
      { date: '2026-06-08', kg: 79 },
    ])
    expect(r).not.toBeNull()
    expect(r!.kgPerWeek).toBeCloseTo(-1, 5)
    expect(r!.n).toBe(2)
  })
})

describe('buildTicker', () => {
  it('shows a real, honest weight trend marked on-track for a losing cut', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'get lean', cleanTitle: 'Get lean', category: 'fitness' }],
      goalDirection: 'lose',
      weighIns: [
        { date: '2026-06-01', kg: 82 },
        { date: '2026-06-08', kg: 81.2 },
        { date: '2026-06-15', kg: 80.5 },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].metric).toBe('weight')
    expect(rows[0].state).toBe('on-track')
    expect(rows[0].detail).toMatch(/%\/wk/)
    expect(rows[0].spark.length).toBeGreaterThan(0)
    expect(rows[0].hint).toBeNull()
  })

  it('gives an honest log-hint (never a fake number) when a goal has no backing metric', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g2', title: 'stop feeling behind', cleanTitle: null, category: null }],
    })
    expect(rows[0].metric).toBeNull()
    expect(rows[0].state).toBe('unknown')
    expect(rows[0].detail).toBeNull()
    expect(typeof rows[0].hint).toBe('string')
  })

  it('reads a training cadence from logged workouts', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g3', title: 'train more', cleanTitle: 'Train more', category: 'fitness' }],
      workoutDatesLast21: ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16'],
    })
    expect(rows[0].metric).toBe('training')
    expect(rows[0].detail).toBe('5 in 3 wks')
    expect(rows[0].hint).toBeNull()
  })
})

describe('buildTicker — classification (word-bound + category-gated)', () => {
  const weighIns = [
    { date: '2026-06-01', kg: 82 },
    { date: '2026-06-08', kg: 81.2 },
    { date: '2026-06-15', kg: 80.5 },
  ]
  const workouts = ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16']

  it('never binds weigh-ins to a non-body word hiding a body substring (lose in Close, cut in execute, lean in Clean)', () => {
    const rows = buildTicker({
      ...BASE,
      weighIns,
      goals: [
        { id: 'g1', title: 'Close more deals', cleanTitle: null, category: 'career' },
        { id: 'g2', title: 'Execute my launch plan', cleanTitle: null, category: 'career' },
        { id: 'g3', title: 'Clean up my finances', cleanTitle: null, category: 'money' },
      ],
    })
    for (const r of rows) {
      expect(r.metric).toBeNull()
      expect(r.spark).toEqual([])
      expect(r.detail).toBeNull()
    }
  })

  it('never reads a career or audience goal as training via a bare run (run a business, brunch cafe)', () => {
    const rows = buildTicker({
      ...BASE,
      workoutDatesLast21: workouts,
      goals: [
        { id: 'g1', title: 'Run a successful business', cleanTitle: null, category: 'career' },
        { id: 'g2', title: 'Launch my brunch cafe', cleanTitle: null, category: 'career' },
      ],
    })
    for (const r of rows) expect(r.metric).toBeNull()
  })

  it('category veto: a money / audience / mind goal never binds body data, even with a body word in the title', () => {
    const rows = buildTicker({
      ...BASE,
      weighIns,
      workoutDatesLast21: workouts,
      goals: [
        { id: 'g1', title: 'Gain 1,000 subscribers', cleanTitle: null, category: 'audience' },
        { id: 'g2', title: 'Cut my spending in half', cleanTitle: null, category: 'money' },
        { id: 'g3', title: 'Train my focus', cleanTitle: null, category: 'mind' },
      ],
    })
    for (const r of rows) {
      expect(r.metric).toBeNull()
      expect(r.state).toBe('unknown')
    }
  })

  it('category veto covers the lift graph too: a career goal never gets handed a barbell', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'Impress my boss with the press release', cleanTitle: null, category: 'career' }],
      lifts: [{ id: 'ohp', name: 'Overhead Press', sessions: benchSessions([50, 55]) }],
    })
    expect(rows[0].metric).toBeNull()
  })

  it('keeps the true positives: get lean, workout everyday, bench 225', () => {
    const lean = buildTicker({
      ...BASE, weighIns, goalDirection: 'lose',
      goals: [{ id: 'g1', title: 'get lean', cleanTitle: null, category: 'health' }],
    })
    expect(lean[0].metric).toBe('weight')

    const wk = buildTicker({
      ...BASE, workoutDatesLast21: workouts,
      goals: [{ id: 'g2', title: 'workout everyday', cleanTitle: null, category: 'health' }],
    })
    expect(wk[0].metric).toBe('training')

    const bench = buildTicker({
      ...BASE,
      goals: [{ id: 'g3', title: 'bench 225', cleanTitle: null, category: 'fitness' }],
      lifts: [{ id: 'bench', name: 'Bench Press', sessions: benchSessions([95, 100, 105]) }],
    })
    expect(bench[0].metric).toBe('lift')
  })

  it('a general-category goal still binds with a strong word-bound body signal (lose weight)', () => {
    const rows = buildTicker({
      ...BASE, weighIns, goalDirection: 'lose',
      goals: [{ id: 'g1', title: 'lose some weight this summer', cleanTitle: null, category: 'general' }],
    })
    expect(rows[0].metric).toBe('weight')
  })

  it('loose verbs alone (gain / lose / cut) never bind the scale to a general or untriaged goal', () => {
    const rows = buildTicker({
      ...BASE, weighIns, goalDirection: 'lose',
      goals: [
        { id: 'g1', title: 'gain confidence', cleanTitle: null, category: 'general' },
        { id: 'g2', title: 'gain confidence', cleanTitle: null, category: null },
        { id: 'g3', title: 'cut down my commute', cleanTitle: null, category: 'general' },
      ],
    })
    for (const r of rows) {
      expect(r.metric).not.toBe('weight')
      expect(r.spark).toEqual([])
    }
  })

  it('loose verbs still bind when the category itself is body-shaped (fitness / health)', () => {
    const rows = buildTicker({
      ...BASE, weighIns, goalDirection: 'lose',
      goals: [
        { id: 'g1', title: 'cut for summer', cleanTitle: null, category: 'fitness' },
        { id: 'g2', title: 'lose a little by June', cleanTitle: null, category: 'health' },
      ],
    })
    expect(rows[0].metric).toBe('weight')
    expect(rows[1].metric).toBe('weight')
  })
})

describe('buildTicker — specific-lift headline graph', () => {
  const benchLift = (weights: number[]) => ({
    lifts: [{ id: 'bench', name: 'Bench Press', sessions: benchSessions(weights) }],
  })

  it("graphs a matched lift's real top-set weight over time, oldest to newest", () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: 'Bench 225', category: 'fitness' }],
      ...benchLift([95, 100, 105]),
    })
    expect(rows[0].metric).toBe('lift')
    expect(rows[0].spark).toEqual([95, 100, 105])
    expect(rows[0].hint).toBeNull()
    expect(typeof rows[0].detail).toBe('string')
    expect(rows[0].detail).toContain('105')
  })

  it('marks a rising lift on-track', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: null }],
      ...benchLift([95, 100, 105]),
    })
    expect(rows[0].state).toBe('on-track')
  })

  it('marks a falling lift drifting', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: null }],
      ...benchLift([105, 100, 95]),
    })
    expect(rows[0].state).toBe('drifting')
  })

  it('marks a flat lift holding', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: null }],
      ...benchLift([100, 100]),
    })
    expect(rows[0].state).toBe('holding')
  })

  it('prefers the direct lift graph over the training-cadence proxy when a lift matches', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: 'fitness' }],
      workoutDatesLast21: ['2026-06-02', '2026-06-05', '2026-06-09'],
      ...benchLift([95, 100, 105]),
    })
    expect(rows[0].metric).toBe('lift')
  })

  it('never invents a lift trend for a lift the user does not train', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: 'fitness' }],
      lifts: [{ id: 'squat', name: 'Back Squat', sessions: benchSessions([140, 145]) }],
    })
    expect(rows[0].metric).not.toBe('lift')
    expect(rows[0].spark).not.toEqual([140, 145])
  })

  it('falls through when a matched lift has only one session (no trend to draw)', () => {
    const rows = buildTicker({
      ...BASE,
      goals: [{ id: 'g1', title: 'bench 225', cleanTitle: null, category: 'fitness' }],
      ...benchLift([100]),
    })
    expect(rows[0].metric).not.toBe('lift')
  })
})

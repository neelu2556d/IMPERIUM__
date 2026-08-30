import { assembleNudges, renderBriefing, type BriefingInputs } from '@/mcp/src/nudges'
import type {
  Profile,
  SleepData,
  WeightData,
  NutritionData,
  WorkoutData,
  SubscriptionData,
  WaterData,
  GoalsData,
  SupplementsData,
  BrandData,
  BusinessData,
  MoodDay,
} from '@/mcp/src/queries'

// End-to-end test of the nudge engine (BUILD41 richer insights) through its pure
// assembly entrypoint — no Supabase needed. Verifies the cross-domain synthesis
// headline and the sharpened weight/nutrition nudges actually render.

const TODAY = '2026-06-17'
// Calendar days counting back from TODAY.
const D = ['2026-06-17', '2026-06-16', '2026-06-15', '2026-06-14', '2026-06-13', '2026-06-12', '2026-06-11']

function sleep(partial: Partial<SleepData> = {}): SleepData {
  return {
    entries: [],
    prefs: { wakeTime: 6.5, sleepNeedHours: 8, recoveryLevel: null, peakHour: null },
    hasWearable: true,
    ...partial,
  }
}
function weights(partial: Partial<WeightData> = {}): WeightData {
  return { entries: [], latestKg: null, deltaKg: null, trend: null, windowDays: 30, weeklyRate: null, nEntries: 0, ...partial }
}
function nutrition(partial: Partial<NutritionData> = {}): NutritionData {
  return {
    onboarded: false,
    kcalTarget: 2400,
    proteinTarget: 180,
    carbsTarget: null,
    fatTarget: null,
    goalOutcome: null,
    adaptiveEnabled: true,
    today: { kcal: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, names: [] },
    recentAvgKcal: null,
    recentAvgProtein: null,
    recentLoggedDays: 0,
    adherence: { loggedDays: 0, avgKcal: null, avgProtein: null, onTargetDays: 0, daysUnder: 0, daysOver: 0, proteinHitDays: 0, adherence: null },
    ...partial,
  }
}
function workouts(dates: string[]): WorkoutData {
  return {
    entries: dates.map((date) => ({ date, dayName: 'Push', submitted: true, exerciseCount: 5, setCount: 18, hasCardio: false })),
    submittedLast7: dates.length,
    windowDays: 14,
  }
}
function inputs(partial: Partial<BriefingInputs> = {}): BriefingInputs {
  const base: BriefingInputs = {
    profile: { firstName: 'Alex', sex: 'm', age: 28, heightCm: 180, startingWeightKg: 82, units: 'metric', goal: null, focusAreas: [], tier: 'pro', subscriptionStatus: 'active', currentPeriodEnd: null } as Profile,
    sleep: sleep(),
    weights: weights(),
    nutrition: nutrition(),
    nutritionDaily: [],
    moodDaily: [],
    workouts: workouts([]),
    subs: { currency: 'CHF', subs: [], totalMonthlyChf: 0, totalYearlyChf: 0 } as SubscriptionData,
    water: { hasData: false, unit: 'bottle', todayServings: 0, recentAvgServings: null, caffeineMgPerDay: null, targetServings: null } as WaterData,
    goals: { hasData: false, streakCurrent: 0, streakLongest: 0, activeGoals: 0, dueToday: 0, completedToday: 0, bigGoals: [], dueTodayGoals: [], dueTomorrowGoals: [] } as GoalsData,
    supplements: { hasData: false, total: 0, takenToday: 0, lowCount: 0, names: [] } as SupplementsData,
    brand: brand(),
    business: { hasData: false, ventures: [] } as BusinessData,
    peakStimulants: { hasData: false, todayCount: 0, caffeineMgToday: null, substances: [], latestEnergy: null, tolerance: null },
    notes: [],
    todayKey: TODAY,
  }
  return { ...base, ...partial }
}
function brand(partial: Partial<BrandData> = {}): BrandData {
  return {
    hasData: false,
    brandCount: 0,
    names: [],
    totalFollowers: 0,
    followerDelta7: null,
    kpis: [],
    goals: [],
    openGoals: 0,
    overdueGoals: 0,
    goalsDoneRecently: 0,
    connectorMetrics: [],
    connectorProviders: [],
    shipCadence: null,
    ...partial,
  }
}

const find = (ns: ReturnType<typeof assembleNudges>, domain: string) => ns.filter((n) => n.domain === domain)

describe('synthesis headline (cross-domain "today\'s call")', () => {
  test('drained recovery → urgent rest day', () => {
    const ns = assembleNudges(
      inputs({
        sleep: sleep({ entries: D.slice(0, 3).map((date) => ({ date, provider: 'whoop', sleepHours: 6, sleepPerf: 70, recovery: 30, hrv: 40, rhr: 60, strain: 12 })) }),
        workouts: workouts([D[1], D[2]]),
      }),
    )
    const today = find(ns, 'today')
    expect(today).toHaveLength(1)
    expect(today[0].severity).toBe('urgent')
    expect(today[0].title).toMatch(/rest/i)
  })

  test('5 days straight on workable recovery → suggest deload', () => {
    const ns = assembleNudges(
      inputs({
        sleep: sleep({ entries: D.slice(0, 3).map((date) => ({ date, provider: 'whoop', sleepHours: 8, sleepPerf: 90, recovery: 70, hrv: 65, rhr: 50, strain: 14 })) }),
        workouts: workouts([D[0], D[1], D[2], D[3], D[4]]), // 5 in a row incl today
      }),
    )
    const today = find(ns, 'today')
    expect(today[0].severity).toBe('suggest')
    expect(today[0].title).toMatch(/ease off|deload|in a row/i)
    expect(today[0].detail).toMatch(/fatigue|deload|rest/i)
  })

  test('peak recovery + low debt → green-light info headline', () => {
    const ns = assembleNudges(
      inputs({
        sleep: sleep({ entries: D.slice(0, 3).map((date) => ({ date, provider: 'oura', sleepHours: 8.2, sleepPerf: 95, recovery: 88, hrv: 80, rhr: 46, strain: 8 })) }),
        workouts: workouts([D[2]]),
      }),
    )
    expect(find(ns, 'today')[0].title).toMatch(/green light/i)
  })

  test('no wearable / no recovery → no synthesis headline', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: [], hasWearable: false }) }))
    expect(find(ns, 'today')).toHaveLength(0)
  })
})

describe('weight nudge with weekly rate + goal verdict', () => {
  test('cutting too fast is flagged as a suggestion', () => {
    const ns = assembleNudges(
      inputs({
        profile: { ...inputs().profile, goal: 'cut' },
        weights: weights({ latestKg: 80, deltaKg: -2, trend: 'down', weeklyRate: { kgPerWeek: -1.6, spanDays: 14, n: 5 }, nEntries: 5 }),
      }),
    )
    const w = find(ns, 'weight')
    // info line (rate) + suggest verdict
    expect(w.some((n) => /80/.test(n.title) && /kg\/wk/.test(n.title))).toBe(true)
    const verdict = w.find((n) => /verdict|too-fast|rate vs/i.test(n.title))
    expect(verdict?.severity).toBe('suggest')
    expect(verdict?.detail).toMatch(/faster|muscle|ease/i)
  })

  test('on-track cut renders an informational verdict', () => {
    const ns = assembleNudges(
      inputs({
        profile: { ...inputs().profile, goal: 'fat_loss' },
        weights: weights({ latestKg: 80, deltaKg: -1, trend: 'down', weeklyRate: { kgPerWeek: -0.7, spanDays: 14, n: 6 }, nEntries: 6 }),
      }),
    )
    const verdict = find(ns, 'weight').find((n) => /on-track|rate vs/i.test(n.title))
    expect(verdict).toBeTruthy()
    expect(verdict?.severity).toBe('info')
  })
})

describe('nutrition adherence pattern nudges', () => {
  test('a week of overeating + protein misses surfaces both patterns', () => {
    const ns = assembleNudges(
      inputs({
        nutrition: nutrition({
          onboarded: true,
          kcalTarget: 2000,
          proteinTarget: 180,
          today: { kcal: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, names: [] },
          recentAvgKcal: 2500,
          recentAvgProtein: 110,
          recentLoggedDays: 5,
          adherence: { loggedDays: 5, avgKcal: 2500, avgProtein: 110, onTargetDays: 1, daysUnder: 1, daysOver: 3, proteinHitDays: 1, adherence: 0.2 },
        }),
      }),
    )
    const n = find(ns, 'nutrition')
    expect(n.some((x) => /over your calorie target/i.test(x.title))).toBe(true)
    expect(n.some((x) => /protein target hit only/i.test(x.title))).toBe(true)
  })
})

describe('business / brand nudges', () => {
  test('overdue goal is urgent, due-soon is a suggestion, momentum + wins are info', () => {
    const ns = assembleNudges(
      inputs({
        brand: brand({
          hasData: true,
          brandCount: 1,
          names: ['Vitality'],
          totalFollowers: 17000,
          followerDelta7: 500,
          kpis: [
            { brand: 'Vitality', label: 'MRR', value: 1200, unit: '$', target: 5000, delta7: 100, delta30: 400, pctToTarget: 24 },
          ],
          goals: [
            { brand: 'Vitality', title: 'Ship new site', due: '2026-06-14', daysLeft: -3, done: false, completedRecently: false },
            { brand: 'Vitality', title: 'Hit $2k MRR', due: '2026-06-19', daysLeft: 2, done: false, completedRecently: false },
            { brand: 'Vitality', title: 'First 10 subs', due: null, daysLeft: null, done: true, completedRecently: true },
          ],
          openGoals: 2,
          overdueGoals: 1,
          goalsDoneRecently: 1,
          connectorMetrics: [
            { provider: 'stripe', metric: 'mrr', label: 'MRR', value: 1200, unit: '$', capturedAt: '2026-06-17T00:00:00Z' },
            { provider: 'shopify', metric: 'sales_30d', label: 'Sales (30d)', value: 3400, unit: '$', capturedAt: '2026-06-17T00:00:00Z' },
          ],
          connectorProviders: ['stripe', 'shopify'],
        }),
      }),
    )
    const biz = find(ns, 'business')
    expect(biz.find((n) => /overdue/i.test(n.title))?.severity).toBe('urgent')
    expect(biz.find((n) => /due within 3 days/i.test(n.title))?.severity).toBe('suggest')
    expect(biz.some((n) => /Metrics this week/i.test(n.title) && /\$100/.test(n.detail))).toBe(true)
    expect(biz.some((n) => /\+500 followers this week/i.test(n.title))).toBe(true)
    expect(biz.some((n) => /completed this week/i.test(n.title))).toBe(true)
    expect(biz.some((n) => /Live from stripe, shopify/i.test(n.title) && /\$1,200/.test(n.detail))).toBe(true)
  })

  test('no brand data emits no business nudges', () => {
    expect(find(assembleNudges(inputs()), 'business')).toHaveLength(0)
  })

  test('ship cadence at risk surfaces a streak-saver nudge', () => {
    const ns = assembleNudges(
      inputs({
        brand: brand({
          hasData: true,
          brandCount: 1,
          names: ['Vitality'],
          shipCadence: { brand: 'Vitality', remaining: 1, streak: 6 },
        }),
      }),
    )
    const n = find(ns, 'business').find((x) => /streak at risk/i.test(x.title))
    expect(n?.severity).toBe('suggest')
    expect(n?.detail).toMatch(/1 more to ship today/i)
  })
})

describe('business nudges (brand KPIs)', () => {
  test('no business data → no business nudges', () => {
    expect(find(assembleNudges(inputs()), 'business')).toHaveLength(0)
  })

  test('a falling revenue-like metric is a suggest, with a % move', () => {
    const ns = assembleNudges(
      inputs({
        business: {
          hasData: true,
          ventures: [{ name: 'Acme', metrics: [{ label: 'Revenue', value: 8000, unit: '$', delta7: -2000 }] }],
        },
      }),
    )
    const b = find(ns, 'business')
    expect(b).toHaveLength(1)
    expect(b[0].severity).toBe('suggest')
    expect(b[0].title).toMatch(/Revenue down this week \(-20%\)/)
  })

  test('a rising non-revenue metric is info; movement beats the quiet line', () => {
    const ns = assembleNudges(
      inputs({
        business: {
          hasData: true,
          ventures: [{ name: 'Acme', metrics: [{ label: 'Followers', value: 1200, unit: '', delta7: 200 }] }],
        },
      }),
    )
    const b = find(ns, 'business')
    expect(b[0].severity).toBe('info')
    expect(b[0].title).toMatch(/Followers up this week \(\+20%\)/)
  })

  test('a tracked metric with no history yet gets a quiet info line', () => {
    const ns = assembleNudges(
      inputs({
        business: {
          hasData: true,
          ventures: [{ name: 'Acme', metrics: [{ label: 'MRR', value: 500, unit: '$', delta7: null }] }],
        },
      }),
    )
    const b = find(ns, 'business')
    expect(b[0].severity).toBe('info')
    expect(b[0].title).toMatch(/1 metric\(s\) tracked/)
  })
})

describe('peak stimulant nudges (caffeine load + timing)', () => {
  const peak = (over: Partial<BriefingInputs['peakStimulants']>): BriefingInputs['peakStimulants'] => ({
    hasData: true, todayCount: 1, caffeineMgToday: null, substances: [], latestEnergy: null, tolerance: null, ...over,
  })

  test('no stimulants → no peak nudges', () => {
    expect(find(assembleNudges(inputs()), 'peak')).toHaveLength(0)
  })

  test('over ~400mg caffeine → a suggest', () => {
    const ns = assembleNudges(inputs({ peakStimulants: peak({ todayCount: 5, caffeineMgToday: 520, substances: [{ name: 'Coffee', dose: 95, unit: 'mg', category: 'caffeine', hour: 9 }] }) }))
    const p = find(ns, 'peak')
    expect(p[0].severity).toBe('suggest')
    expect(p[0].title).toMatch(/High caffeine today: 520 mg/)
  })

  test('afternoon caffeine under the cap → a sleep-timing suggest', () => {
    const ns = assembleNudges(inputs({ peakStimulants: peak({ todayCount: 2, caffeineMgToday: 190, substances: [{ name: 'Coffee', dose: 95, unit: 'mg', category: 'caffeine', hour: 15.5 }] }) }))
    const p = find(ns, 'peak')
    expect(p[0].severity).toBe('suggest')
    expect(p[0].title).toMatch(/this afternoon/)
  })

  test('moderate morning caffeine → an info line', () => {
    const ns = assembleNudges(inputs({ peakStimulants: peak({ todayCount: 1, caffeineMgToday: 95, substances: [{ name: 'Coffee', dose: 95, unit: 'mg', category: 'caffeine', hour: 8 }] }) }))
    const p = find(ns, 'peak')
    expect(p[0].severity).toBe('info')
    expect(p[0].title).toMatch(/Stimulants: 1 today, 95 mg caffeine/)
  })
})

describe('renderBriefing', () => {
  test('produces a headed, icon-prefixed text block', () => {
    const ns = assembleNudges(
      inputs({
        sleep: sleep({ entries: D.slice(0, 3).map((date) => ({ date, provider: 'whoop', sleepHours: 7, sleepPerf: 80, recovery: 72, hrv: 60, rhr: 52, strain: 10 })) }),
      }),
    )
    const text = renderBriefing({ generatedAt: '2026-06-17T07:00:00Z', dayKey: TODAY, greetingName: 'Alex', nudges: ns })
    expect(text).toContain('Vitality briefing — 2026-06-17 for Alex')
    expect(text).toMatch(/[🔴🟡·] \[/)
  })
})

describe('cross-module: tired → eating (the moat)', () => {
  // 12 days, recovery anti-correlated with calories: lower recovery → more food.
  const series = [
    { date: '2026-06-12', recovery: 30, kcal: 3100 },
    { date: '2026-06-11', recovery: 35, kcal: 3000 },
    { date: '2026-06-10', recovery: 40, kcal: 2950 },
    { date: '2026-06-09', recovery: 45, kcal: 2900 },
    { date: '2026-06-08', recovery: 55, kcal: 2600 },
    { date: '2026-06-07', recovery: 60, kcal: 2500 },
    { date: '2026-06-06', recovery: 65, kcal: 2400 },
    { date: '2026-06-05', recovery: 70, kcal: 2300 },
    { date: '2026-06-04', recovery: 75, kcal: 2250 },
    { date: '2026-06-03', recovery: 80, kcal: 2200 },
    { date: '2026-06-02', recovery: 85, kcal: 2150 },
    { date: '2026-06-01', recovery: 90, kcal: 2100 },
  ]
  const sleepEntries = series.map((s) => ({
    date: s.date, provider: 'whoop', sleepHours: 7, sleepPerf: 80, recovery: s.recovery, hrv: 60, rhr: 50, strain: 12,
  }))
  const nutritionDaily = series.map((s) => ({ date: s.date, kcal: s.kcal }))

  test('fires a warm nutrition nudge when the pattern is real', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries }), nutritionDaily }))
    const te = ns.find((n) => /eat ~\d+ kcal more/.test(n.title))
    expect(te).toBeTruthy()
    expect(te!.domain).toBe('nutrition')
    expect(te!.title).toContain('813') // 2988 (low-recovery avg) − 2175 (high-recovery avg)
    // newest entry reads recovery 30 (a low day) → actionable framing, but still calm 'info'
    expect(te!.severity).toBe('info')
    expect(te!.title).toMatch(/Heads up/)
    expect(te!.detail).toMatch(/be kind to yourself/) // morning: nothing logged yet → gentle "plan"
    expect(te!.detail).toMatch(/biology, not a failure/)
    expect(te!.detail).not.toMatch(/shame|lazy|should have/i) // warm, never scolding
  })

  test('on a low day with food already logged, drops the forward "plan" framing (evening-safe)', () => {
    const ns = assembleNudges(
      inputs({
        sleep: sleep({ entries: sleepEntries }),
        nutritionDaily,
        nutrition: nutrition({ kcalTarget: 2400, today: { kcal: 1800, protein: 120, carbs: 200, fat: 60, mealCount: 3, names: [] } }),
      }),
    )
    const te = ns.find((n) => /eat ~\d+ kcal more/.test(n.title))!
    expect(te.detail).toMatch(/no guilt about what you ate/)
    expect(te.detail).not.toMatch(/keep meals simple/) // doesn't tell them to "plan" after the fact
  })

  test('stays silent when there are too few paired days', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries.slice(0, 5) }), nutritionDaily: nutritionDaily.slice(0, 5) }))
    expect(ns.find((n) => /kcal more/.test(n.title))).toBeFalsy()
  })

  test('stays silent when calories are flat across recovery (no real pattern)', () => {
    const flat = series.map((s) => ({ date: s.date, kcal: 2400 }))
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries }), nutritionDaily: flat }))
    expect(ns.find((n) => /kcal more/.test(n.title))).toBeFalsy()
  })
})

describe('cross-module: caffeine → recovery (the seam)', () => {
  // Caffeine on a day vs recovery the NEXT morning (the +1-day lag). Heavier
  // caffeine → lower next-day recovery: a real, gated seam.
  const lag = [
    { caffDate: '2026-06-01', caffeineMg: 100, recDate: '2026-06-02', recovery: 92 },
    { caffDate: '2026-06-02', caffeineMg: 150, recDate: '2026-06-03', recovery: 88 },
    { caffDate: '2026-06-03', caffeineMg: 200, recDate: '2026-06-04', recovery: 84 },
    { caffDate: '2026-06-04', caffeineMg: 250, recDate: '2026-06-05', recovery: 80 },
    { caffDate: '2026-06-05', caffeineMg: 300, recDate: '2026-06-06', recovery: 70 },
    { caffDate: '2026-06-06', caffeineMg: 350, recDate: '2026-06-07', recovery: 66 },
    { caffDate: '2026-06-07', caffeineMg: 400, recDate: '2026-06-08', recovery: 60 },
    { caffDate: '2026-06-08', caffeineMg: 450, recDate: '2026-06-09', recovery: 54 },
    { caffDate: '2026-06-09', caffeineMg: 500, recDate: '2026-06-10', recovery: 44 },
    { caffDate: '2026-06-10', caffeineMg: 550, recDate: '2026-06-11', recovery: 40 },
    { caffDate: '2026-06-11', caffeineMg: 600, recDate: '2026-06-12', recovery: 36 },
    { caffDate: '2026-06-12', caffeineMg: 650, recDate: '2026-06-13', recovery: 32 },
  ]
  const stimulantsDaily = lag.map((x) => ({ date: x.caffDate, caffeineMg: x.caffeineMg }))
  const sleepEntries = lag.map((x) => ({
    date: x.recDate, provider: 'whoop', sleepHours: 7, sleepPerf: 80, recovery: x.recovery, hrv: 60, rhr: 50, strain: 12,
  }))
  // The seam's detail uniquely says "heaviest-caffeine days" — distinguishes it from
  // the caffeine-load nudge (also domain 'peak') that fires on a genuinely heavy day.
  const findSeam = (ns: ReturnType<typeof assembleNudges>) =>
    ns.find((n) => n.domain === 'peak' && /heaviest-caffeine days/i.test(n.detail))

  test('fires a warm peak nudge with the recovery receipts, framed correlationally (never causal)', () => {
    const cr = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries }), stimulantsDaily })))
    expect(cr).toBeTruthy()
    expect(cr!.domain).toBe('peak')
    expect(cr!.severity).toBe('info') // nothing heavy logged today → calm pattern mirror, never an alarm
    expect(cr!.title).toMatch(/48/) // deltaRecovery: 86 (after light) − 38 (after heavy)
    expect(cr!.detail).toMatch(/575/) // heaviest-caffeine bucket mg (the receipts)
    expect(cr!.detail).toMatch(/175/) // lightest-caffeine bucket mg
    expect(cr!.detail).toMatch(/12 days/)
    // Honesty: a CORRELATION, never a stated mechanism/cause (the gate can't prove causation).
    expect(cr!.detail).toMatch(/tend to move together|could be/i)
    expect(cr!.detail).not.toMatch(/caffeine lingers|trims deep sleep/i) // no fabricated mechanism
    expect(cr!.title).not.toMatch(/cost you/i) // not a causal "it cost you" claim
    expect(cr!.detail).not.toMatch(/shame|lazy|should have|bad habit/i) // warm, never scolding
  })

  test('escalates to an actionable suggest only when today is heavy FOR THIS USER (≥ their heaviest third)', () => {
    const cr = findSeam(assembleNudges(inputs({
      sleep: sleep({ entries: sleepEntries }),
      stimulantsDaily,
      // 600 mg today ≥ the ~575 mg heaviest-bucket average → a genuinely heavy day for them.
      peakStimulants: { hasData: true, todayCount: 4, caffeineMgToday: 600, substances: [{ name: 'Coffee', dose: 150, unit: 'mg', category: 'caffeine', hour: 16 }], latestEnergy: null, tolerance: null },
    })))
    expect(cr!.severity).toBe('suggest')
    expect(cr!.detail).toMatch(/mid-afternoon|experiment/i) // a real, forward-looking, optional steer
  })

  test('a normal afternoon dose stays a calm info (no daily nag)', () => {
    const cr = findSeam(assembleNudges(inputs({
      sleep: sleep({ entries: sleepEntries }),
      stimulantsDaily,
      // Late but light (150 mg < ~575): the pattern still mirrors, but it does NOT escalate.
      peakStimulants: { hasData: true, todayCount: 1, caffeineMgToday: 150, substances: [{ name: 'Coffee', dose: 150, unit: 'mg', category: 'caffeine', hour: 16 }], latestEnergy: null, tolerance: null },
    })))
    expect(cr!.severity).toBe('info')
  })

  test('stays silent below the paired-days floor (never cries wolf on thin data)', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries.slice(0, 5) }), stimulantsDaily: stimulantsDaily.slice(0, 5) }))
    expect(findSeam(ns)).toBeFalsy()
  })

  test('stays silent when caffeine is flat across days (no gradient to read)', () => {
    const flat = stimulantsDaily.map((s) => ({ date: s.date, caffeineMg: 300 }))
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries }), stimulantsDaily: flat }))
    expect(findSeam(ns)).toBeFalsy()
  })

  test('stays silent with no caffeine history at all', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries }) }))
    expect(findSeam(ns)).toBeFalsy()
  })
})

describe('cross-module: sleep → mood (the seam)', () => {
  // Sleep hours vs that day's mood (1–5). More sleep → better mood: a real 'pos'
  // seam. Newest day first, matching getSleep / getMoodDaily.
  const sm = [
    { date: '2026-06-12', sleepHours: 8.6, mood: 5.0 },
    { date: '2026-06-11', sleepHours: 8.3, mood: 4.8 },
    { date: '2026-06-10', sleepHours: 8.0, mood: 4.6 },
    { date: '2026-06-09', sleepHours: 7.7, mood: 4.4 },
    { date: '2026-06-08', sleepHours: 7.4, mood: 4.2 },
    { date: '2026-06-07', sleepHours: 7.1, mood: 4.0 },
    { date: '2026-06-06', sleepHours: 6.8, mood: 3.8 },
    { date: '2026-06-05', sleepHours: 6.5, mood: 3.6 },
    { date: '2026-06-04', sleepHours: 5.9, mood: 3.2 },
    { date: '2026-06-03', sleepHours: 5.6, mood: 3.0 },
    { date: '2026-06-02', sleepHours: 5.3, mood: 2.8 },
    { date: '2026-06-01', sleepHours: 5.0, mood: 2.6 },
  ]
  const sleepEntries = (rows = sm) =>
    rows.map((x) => ({ date: x.date, provider: 'whoop', sleepHours: x.sleepHours, sleepPerf: null, recovery: 60, hrv: null, rhr: null, strain: null }))
  const moodDaily = (rows = sm): MoodDay[] => rows.map((x) => ({ date: x.date, mood: x.mood, source: 'checkin' }))
  const findSeam = (ns: ReturnType<typeof assembleNudges>) =>
    ns.find((n) => /better-slept nights/i.test(n.title))

  test('fires a warm sleep nudge with the mood receipts, framed correlationally (never causal or doom)', () => {
    const seam = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries() }), moodDaily: moodDaily() })))
    expect(seam).toBeTruthy()
    expect(seam!.domain).toBe('sleep')
    expect(seam!.severity).toBe('info') // newest night (8.6h) is a good one → calm mirror
    expect(seam!.title).toMatch(/1\.8/) // deltaMood: 4.7 (after best-slept) − 2.9 (after shortest)
    expect(seam!.detail).toMatch(/4\.7/) // mood after best-slept nights (the receipts)
    expect(seam!.detail).toMatch(/2\.9/) // mood after shortest nights
    expect(seam!.detail).toMatch(/12 days/)
    expect(seam!.detail).toMatch(/could be|move together/i) // honesty: correlation, not cause
    expect(seam!.detail).not.toMatch(/you'?ll feel|will feel|guaranteed|because you/i) // never predicts/claims cause
    expect(seam!.detail).not.toMatch(/shame|lazy|should have/i) // warm, never scolding
  })

  test('appends a gentle grace note (still calm info) when last night ran short for them', () => {
    // Newest night is a short 4.8h (below their short-sleep bucket) → extra-kindness note,
    // but a slept night can't be "fixed" today, so it never escalates to a louder severity.
    const short = [{ date: '2026-06-13', sleepHours: 4.8, mood: 3.0 }, ...sm]
    const seam = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries(short) }), moodDaily: moodDaily(short) })))!
    expect(seam.severity).toBe('info')
    expect(seam.detail).toMatch(/extra gentle/i)
  })

  test('stays silent below the paired-days floor (never cries wolf on thin data)', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries(sm.slice(0, 5)) }), moodDaily: moodDaily(sm.slice(0, 5)) }))
    expect(findSeam(ns)).toBeFalsy()
  })

  test('stays silent when mood is flat across sleep (no real pattern)', () => {
    const flat = sm.map((x) => ({ ...x, mood: 4 }))
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries(flat) }), moodDaily: moodDaily(flat) }))
    expect(findSeam(ns)).toBeFalsy()
  })

  test('stays silent with no mood history at all', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries() }) }))
    expect(findSeam(ns)).toBeFalsy()
  })

  test('fires for a NO-WEARABLE user from the manual peak check-in (Sam, BUILD62)', () => {
    // No wearable entries at all — sleep hours come from the manual daily check-in.
    const manualSleepDaily = sm.map((x) => ({ date: x.date, sleepHours: x.sleepHours }))
    const seam = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: [] }), moodDaily: moodDaily(), manualSleepDaily })))
    expect(seam).toBeTruthy()
    expect(seam!.domain).toBe('sleep')
    expect(seam!.detail).toMatch(/12 days/)
  })

  test('shows the gentle grace note for a NO-WEARABLE user after a short night too', () => {
    // The "last night ran short" note must read the manual check-in, not just a wearable.
    const short = [{ date: '2026-06-13', sleepHours: 4.8, mood: 3.0 }, ...sm]
    const manualSleepDaily = short.map((x) => ({ date: x.date, sleepHours: x.sleepHours }))
    const seam = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: [] }), moodDaily: moodDaily(short), manualSleepDaily })))!
    expect(seam.detail).toMatch(/extra gentle/i)
  })

  test('prefers the wearable reading when a day has both wearable and manual sleep', () => {
    // Manual sleep is flat (would kill the pattern); wearable carries the real hours.
    const flatManual = sm.map((x) => ({ date: x.date, sleepHours: 1 }))
    const seam = findSeam(assembleNudges(inputs({ sleep: sleep({ entries: sleepEntries() }), moodDaily: moodDaily(), manualSleepDaily: flatManual })))
    expect(seam).toBeTruthy() // wearable wins → the real sleep×mood pattern still fires
  })
})

describe('mind: gentle mood reach-out (Vee notices)', () => {
  const lowMood: MoodDay[] = [
    { date: '2026-06-12', mood: 2, source: 'checkin' },
    { date: '2026-06-11', mood: 2, source: 'checkin' },
    { date: '2026-06-10', mood: 3, source: 'checkin' },
    { date: '2026-06-09', mood: 2, source: 'notes' },
    { date: '2026-06-08', mood: 1, source: 'notes' },
    { date: '2026-06-07', mood: 2, source: 'checkin' },
  ]

  test('reaches out warmly when mood reads low', () => {
    const m = assembleNudges(inputs({ moodDaily: lowMood })).find((n) => n.domain === 'mind')
    expect(m).toBeTruthy()
    expect(m!.severity).toBe('info') // calm, never an alarm
    expect(m!.title).toMatch(/seemed low|dipping/)
    expect(m!.detail).toMatch(/talk it through|right here/)
    expect(m!.detail).not.toMatch(/should|guilt|fix yourself|snap out/i)
  })

  test('stays quiet when mood is fine', () => {
    const goodMood: MoodDay[] = lowMood.map((d) => ({ ...d, mood: 4 }))
    expect(assembleNudges(inputs({ moodDaily: goodMood })).find((n) => n.domain === 'mind')).toBeFalsy()
  })

  test('stays quiet below the day floor (a bad day or two is not a trend)', () => {
    const twoDays = lowMood.slice(0, 2)
    expect(assembleNudges(inputs({ moodDaily: twoDays })).find((n) => n.domain === 'mind')).toBeFalsy()
  })
})

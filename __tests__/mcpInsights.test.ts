import {
  dayIndex,
  daysBetween,
  keyForIndex,
  weeklyWeightRate,
  normalizeGoal,
  classifyWeightRate,
  windowTrend,
  acuteLoad,
  consecutiveTrainingDays,
  nutritionAdherence,
  recoveryAfterTraining,
  subscriptionBurn,
  correlate,
  detectSeam,
  pearsonSignificant,
  tiredEating,
  caffeineRecovery,
  sentimentScore,
  sentimentToMood,
  moodTrend,
} from '@/mcp/src/insights'

// Pure-derivation layer for the Vitality MCP (richer insights, BUILD41).

describe('date helpers', () => {
  test('dayIndex parses YYYY-MM-DD and is invertible via keyForIndex', () => {
    const i = dayIndex('2026-06-17')
    expect(i).not.toBeNull()
    expect(keyForIndex(i as number)).toBe('2026-06-17')
  })
  test('dayIndex returns null for garbage', () => {
    expect(dayIndex('not-a-date')).toBeNull()
  })
  test('daysBetween counts forward', () => {
    expect(daysBetween('2026-06-10', '2026-06-17')).toBe(7)
    expect(daysBetween('2026-06-17', '2026-06-10')).toBe(-7)
  })
})

describe('weeklyWeightRate', () => {
  test('null with fewer than 2 entries', () => {
    expect(weeklyWeightRate([{ date: '2026-06-17', kg: 80 }])).toBeNull()
    expect(weeklyWeightRate([])).toBeNull()
  })
  test('null when all entries fall on the same day (no slope)', () => {
    expect(
      weeklyWeightRate([
        { date: '2026-06-17', kg: 80 },
        { date: '2026-06-17', kg: 81 },
      ]),
    ).toBeNull()
  })
  test('two points 7 days apart give a clean kg/week and is order-independent', () => {
    const newestFirst = weeklyWeightRate([
      { date: '2026-06-17', kg: 80 },
      { date: '2026-06-10', kg: 81 },
    ])
    const oldestFirst = weeklyWeightRate([
      { date: '2026-06-10', kg: 81 },
      { date: '2026-06-17', kg: 80 },
    ])
    expect(newestFirst?.kgPerWeek).toBeCloseTo(-1, 5)
    expect(newestFirst?.spanDays).toBe(7)
    expect(newestFirst?.n).toBe(2)
    expect(oldestFirst?.kgPerWeek).toBeCloseTo(-1, 5)
  })
  test('least-squares smooths a noisy middle reading', () => {
    // Trend is clearly down ~1kg/wk despite a spurious spike mid-window.
    const r = weeklyWeightRate([
      { date: '2026-06-15', kg: 79 },
      { date: '2026-06-08', kg: 83 }, // outlier up
      { date: '2026-06-01', kg: 81 },
    ])
    expect(r).not.toBeNull()
    expect(r!.kgPerWeek).toBeLessThan(0)
    expect(r!.n).toBe(3)
  })
})

describe('normalizeGoal', () => {
  test.each([
    ['cut', 'cut'],
    ['fat_loss', 'cut'],
    ['lose weight', 'cut'],
    ['lean', 'cut'],
    ['bulk', 'bulk'],
    ['build muscle', 'bulk'],
    ['gain mass', 'bulk'],
    ['maintain', 'maintain'],
    ['recomp', 'maintain'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeGoal(input)).toBe(expected)
  })
  test('null/unknown → null', () => {
    expect(normalizeGoal(null)).toBeNull()
    expect(normalizeGoal('vibes')).toBeNull()
  })
})

describe('classifyWeightRate', () => {
  test('unknown when rate or weight missing', () => {
    expect(classifyWeightRate(null, 80, 'cut').verdict).toBe('unknown')
    expect(classifyWeightRate(-0.5, null, 'cut').verdict).toBe('unknown')
  })
  test('cut: -1kg/wk @80kg (-1.25% BW) is on-track', () => {
    const a = classifyWeightRate(-1, 80, 'cut')
    expect(a.verdict).toBe('on-track')
    expect(a.pctPerWeek).toBeCloseTo(-1.25, 2)
    expect(a.goal).toBe('cut')
  })
  test('cut: losing too fast', () => {
    expect(classifyWeightRate(-1.6, 80, 'cut').verdict).toBe('too-fast')
  })
  test('cut: gaining is wrong-direction', () => {
    expect(classifyWeightRate(0.3, 80, 'fat_loss').verdict).toBe('wrong-direction')
  })
  test('cut: flat is stalled', () => {
    expect(classifyWeightRate(0, 80, 'cut').verdict).toBe('stalled')
  })
  test('bulk: small gain is on-track, big gain too-fast, loss wrong-direction', () => {
    expect(classifyWeightRate(0.3, 80, 'bulk').verdict).toBe('on-track')
    expect(classifyWeightRate(0.8, 80, 'bulk').verdict).toBe('too-fast')
    expect(classifyWeightRate(-0.3, 80, 'gain muscle').verdict).toBe('wrong-direction')
  })
  test('maintain: holding steady is on-track, drift flagged', () => {
    expect(classifyWeightRate(0.1, 80, 'maintain').verdict).toBe('on-track')
    expect(classifyWeightRate(0.5, 80, 'maintain').verdict).toBe('drifting')
  })
  test('no goal: describes direction without judging', () => {
    expect(classifyWeightRate(0.02, 80, null).verdict).toBe('stalled')
    expect(classifyWeightRate(0.5, 80, null).verdict).toBe('drifting')
  })
})

describe('windowTrend', () => {
  test('detects a rising recent window', () => {
    const t = windowTrend([62, 61, 60, 51, 50, 49], 3)
    expect(t?.direction).toBe('up')
    expect(t?.recentAvg).toBeCloseTo(61, 1)
    expect(t?.priorAvg).toBeCloseTo(50, 1)
    expect(t?.delta).toBeCloseTo(11, 1)
  })
  test('detects a falling recent window', () => {
    expect(windowTrend([40, 41, 42, 60, 61, 62], 3)?.direction).toBe('down')
  })
  test('flat within the dead band', () => {
    expect(windowTrend([50, 50, 50, 50, 50, 50], 3)?.direction).toBe('flat')
  })
  test('skips nulls but still needs both windows populated', () => {
    expect(windowTrend([null, 60, 60, null, 50, 50], 3)?.direction).toBe('up')
    expect(windowTrend([60], 3)).toBeNull()
    expect(windowTrend([60, 61, 62], 3)).toBeNull() // no prior window
  })
})

describe('acuteLoad', () => {
  test('sums the most recent N readings, skipping nulls', () => {
    expect(acuteLoad([10, 12, 8, 99, 99], 3)).toBe(30)
    expect(acuteLoad([10, null, 8], 3)).toBe(18)
  })
  test('null when no readings', () => {
    expect(acuteLoad([null, null], 3)).toBeNull()
  })
})

describe('consecutiveTrainingDays', () => {
  test('counts back-to-back days including today', () => {
    expect(
      consecutiveTrainingDays(['2026-06-17', '2026-06-16', '2026-06-15'], '2026-06-17'),
    ).toBe(3)
  })
  test('stops at the first gap', () => {
    expect(
      consecutiveTrainingDays(['2026-06-17', '2026-06-15', '2026-06-14'], '2026-06-17'),
    ).toBe(1)
  })
  test('measures ending yesterday when nothing logged today', () => {
    expect(consecutiveTrainingDays(['2026-06-16', '2026-06-15'], '2026-06-17')).toBe(2)
  })
  test('zero when no sessions', () => {
    expect(consecutiveTrainingDays([], '2026-06-17')).toBe(0)
  })
  test('dedupes multiple sessions on the same day', () => {
    expect(
      consecutiveTrainingDays(['2026-06-17', '2026-06-17', '2026-06-16'], '2026-06-17'),
    ).toBe(2)
  })
})

describe('recoveryAfterTraining', () => {
  // recovery on date D reflects the night after D-1's activity.
  const trained = ['2026-06-10', '2026-06-12', '2026-06-14']
  test('buckets recovery by whether the prior day was a training day', () => {
    const sleep = [
      { date: '2026-06-11', recovery: 60 }, // after training (10)
      { date: '2026-06-13', recovery: 50 }, // after training (12)
      { date: '2026-06-12', recovery: 80 }, // after rest (11)
      { date: '2026-06-16', recovery: 90 }, // after rest (15)
    ]
    const r = recoveryAfterTraining(sleep, trained)
    expect(r).not.toBeNull()
    expect(r!.afterTrainingAvg).toBeCloseTo(55, 1)
    expect(r!.afterRestAvg).toBeCloseTo(85, 1)
    expect(r!.delta).toBeCloseTo(-30, 1)
    expect(r!.afterTrainingN).toBe(2)
    expect(r!.afterRestN).toBe(2)
  })
  test('null when a bucket has fewer than 2 readings', () => {
    expect(recoveryAfterTraining([{ date: '2026-06-11', recovery: 60 }], trained)).toBeNull()
  })
  test('ignores null recovery readings', () => {
    const r = recoveryAfterTraining(
      [
        { date: '2026-06-11', recovery: null },
        { date: '2026-06-13', recovery: 50 },
        { date: '2026-06-15', recovery: 52 },
        { date: '2026-06-12', recovery: 80 },
        { date: '2026-06-16', recovery: 82 },
      ],
      trained,
    )
    // 13&15 after training; 12&16 after rest
    expect(r!.afterTrainingN).toBe(2)
    expect(r!.afterRestN).toBe(2)
  })
})

describe('subscriptionBurn', () => {
  test('annualizes and computes share of net worth', () => {
    const b = subscriptionBurn(100, 24000)
    expect(b.yearlyChf).toBe(1200)
    expect(b.pctOfNetWorth).toBeCloseTo(5, 1)
  })
  test('null share when net worth is zero or negative', () => {
    expect(subscriptionBurn(100, 0).pctOfNetWorth).toBeNull()
    expect(subscriptionBurn(100, -500).pctOfNetWorth).toBeNull()
    expect(subscriptionBurn(100, 0).yearlyChf).toBe(1200)
  })
})

describe('nutritionAdherence', () => {
  test('classifies days under/over/on-target and protein hits', () => {
    const a = nutritionAdherence(
      [
        { kcal: 2000, protein: 150 },
        { kcal: 1700, protein: 100 },
        { kcal: 2300, protein: 160 },
      ],
      2000,
      150,
    )
    expect(a.loggedDays).toBe(3)
    expect(a.onTargetDays).toBe(1)
    expect(a.daysUnder).toBe(1)
    expect(a.daysOver).toBe(1)
    expect(a.proteinHitDays).toBe(2)
    expect(a.avgKcal).toBe(2000)
    expect(a.avgProtein).toBe(137)
    expect(a.adherence).toBeCloseTo(0.33, 2)
  })
  test('empty window yields nulls, not NaN', () => {
    const a = nutritionAdherence([], 2000, 150)
    expect(a.loggedDays).toBe(0)
    expect(a.avgKcal).toBeNull()
    expect(a.adherence).toBeNull()
  })
})

describe('correlate (the cross-module primitive)', () => {
  test('perfect positive line → r = 1', () => {
    expect(correlate([1, 2, 3, 4], [2, 4, 6, 8])).toEqual({ r: 1, n: 4 })
  })
  test('perfect negative line → r = -1', () => {
    expect(correlate([1, 2, 3, 4], [8, 6, 4, 2])).toEqual({ r: -1, n: 4 })
  })
  test('uncorrelated series → r near 0', () => {
    const got = correlate([1, 2, 3, 4], [3, 1, 4, 2])
    expect(Math.abs(got!.r)).toBeLessThan(0.5)
  })
  test('fewer than 3 pairs → null', () => {
    expect(correlate([1, 2], [3, 4])).toBeNull()
  })
  test('a flat series has no variance → null (not NaN)', () => {
    expect(correlate([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull()
  })
  test('uses the shorter length when series differ', () => {
    expect(correlate([1, 2, 3], [2, 4, 6, 999])!.n).toBe(3)
  })
})

describe('tiredEating (recovery × calories)', () => {
  // recovery anti-correlated with calories — a real "eat more when tired" pattern.
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
  const recovery = series.map((s) => ({ date: s.date, recovery: s.recovery }))
  const kcal = series.map((s) => ({ date: s.date, kcal: s.kcal }))

  test('finds the pattern and flags it meaningful', () => {
    const te = tiredEating(recovery, kcal)!
    expect(te.nPaired).toBe(12)
    expect(te.bucketDays).toBe(4)
    expect(te.lowAvgKcal).toBe(2988)
    expect(te.highAvgKcal).toBe(2175)
    expect(te.deltaKcal).toBe(813)
    expect(te.r).toBeLessThan(-0.2)
    expect(te.meaningful).toBe(true)
  })

  test('null below the paired-days floor (never cries wolf on thin data)', () => {
    expect(tiredEating(recovery.slice(0, 5), kcal.slice(0, 5))).toBeNull()
  })

  test('only joins days present on BOTH sides', () => {
    const te = tiredEating(recovery, kcal.slice(0, 9)) // 9 days of food
    expect(te!.nPaired).toBe(9)
  })

  test('flat calories → not meaningful (no real gap)', () => {
    const flat = series.map((s) => ({ date: s.date, kcal: 2500 }))
    expect(tiredEating(recovery, flat)!.meaningful).toBe(false)
  })

  test('a small calorie gap stays under the gate', () => {
    const tiny = series.map((s) => ({ date: s.date, kcal: s.recovery < 50 ? 2450 : 2400 }))
    expect(tiredEating(recovery, tiny)!.meaningful).toBe(false)
  })

  test('gates on the ROUNDED delta it displays (boundary: raw 149.5 rounds to 150 → fires)', () => {
    // Low bucket kcal mean = 2575.75 (→ 2576), high = 2426.25 (→ 2426): displayed
    // deltaKcal = 150, exactly the threshold → must fire. The gate must judge the
    // SAME rounded 150 it shows, not the raw 149.5 (which would wrongly stay silent).
    const kcalB = [2576, 2576, 2576, 2575, 2540, 2510, 2480, 2450, 2426, 2426, 2426, 2427]
    const boundary = recovery.map((r, i) => ({ date: r.date, kcal: kcalB[i] }))
    const te = tiredEating(recovery, boundary)!
    expect(te.deltaKcal).toBe(150)
    expect(te.meaningful).toBe(true)
  })
})

describe('caffeineRecovery (caffeine today × NEXT-day recovery)', () => {
  // More caffeine on a day → lower recovery the *next* morning (the +1-day lag is
  // the whole point: tonight's caffeine shows up in tomorrow's score).
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
  const caffeineByDate = lag.map((x) => ({ date: x.caffDate, caffeineMg: x.caffeineMg }))
  const recoveryByDate = lag.map((x) => ({ date: x.recDate, recovery: x.recovery }))

  test('finds the lagged pattern and flags it meaningful', () => {
    const cr = caffeineRecovery(caffeineByDate, recoveryByDate)!
    expect(cr.nPaired).toBe(12)
    expect(cr.bucketDays).toBe(4)
    expect(cr.lowCaffeineMg).toBe(175)
    expect(cr.highCaffeineMg).toBe(575)
    expect(cr.recoveryAfterLow).toBe(86)
    expect(cr.recoveryAfterHigh).toBe(38)
    expect(cr.deltaRecovery).toBe(48)
    expect(cr.r).toBeLessThan(-0.2)
    expect(cr.meaningful).toBe(true)
  })

  test('joins on the NEXT day only — a same-day join would find nothing', () => {
    // Caffeine on odd dates, recovery on the following even dates: zero same-day
    // overlap, so a (buggy) same-day join returns null. The +1 lag finds all 9.
    const caff = ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07', '2026-06-09', '2026-06-11', '2026-06-13', '2026-06-15', '2026-06-17']
      .map((date, i) => ({ date, caffeineMg: 100 + i * 60 }))
    const rec = ['2026-06-02', '2026-06-04', '2026-06-06', '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-14', '2026-06-16', '2026-06-18']
      .map((date, i) => ({ date, recovery: 90 - i * 7 }))
    expect(caffeineRecovery(caff, rec)!.nPaired).toBe(9)
  })

  test('null below the paired-days floor (never cries wolf on thin data)', () => {
    expect(caffeineRecovery(caffeineByDate.slice(0, 5), recoveryByDate.slice(0, 5))).toBeNull()
  })

  test('flat caffeine → not meaningful (no gradient to read)', () => {
    const flat = caffeineByDate.map((c) => ({ date: c.date, caffeineMg: 300 }))
    expect(caffeineRecovery(flat, recoveryByDate)!.meaningful).toBe(false)
  })

  test('a tiny recovery gap stays under the gate', () => {
    const tinyRec = lag.map((x) => ({ date: x.recDate, recovery: x.caffeineMg >= 400 ? 72 : 74 }))
    expect(caffeineRecovery(caffeineByDate, tinyRec)!.meaningful).toBe(false)
  })

  test('treats recovery 0 as a no-reading sentinel, never a real 0% day', () => {
    // The 4 heaviest-caffeine days have a next-day recovery of 0 (= "no wearable
    // reading"); the rest are a flat, healthy 70. If 0 were taken literally it would
    // fabricate a massive false caffeine→crash pattern. Dropped, what's left is flat.
    const flatish = caffeineByDate.map((c, i) => ({ date: recoveryByDate[i].date, recovery: c.caffeineMg >= 500 ? 0 : 70 }))
    const cr = caffeineRecovery(caffeineByDate, flatish)
    expect(cr === null || cr.meaningful === false).toBe(true)
  })

  test('gates on the ROUNDED delta it displays (boundary: raw 4.5 rounds to 5 → fires)', () => {
    // recoveryAfterLow mean = 69.75 (→ 70), recoveryAfterHigh = 65.25 (→ 65): displayed
    // deltaRecovery = 5, exactly the threshold → must fire on the same rounded value shown.
    const recB = [70, 70, 70, 69, 69, 68, 67, 66, 65, 65, 65, 66]
    const recBoundary = recoveryByDate.map((r, i) => ({ date: r.date, recovery: recB[i] }))
    const cr = caffeineRecovery(caffeineByDate, recBoundary)!
    expect(cr.deltaRecovery).toBe(5)
    expect(cr.meaningful).toBe(true)
  })
})

describe('detectSeam (the reusable cross-tile engine)', () => {
  // A driver series and an outcome series joined by date. The engine sorts by the
  // driver, contrasts its low vs high third, and reports the outcome gap + the
  // whole-window correlation — the shared skeleton behind every curated seam.
  const days = (vals: number[], start = 1) =>
    vals.map((value, i) => ({ date: `2026-06-${String(start + i).padStart(2, '0')}`, value }))

  // recovery (driver) ↓ → calories (outcome) ↑ — a clean 'neg' seam (tired→eating).
  const driverNeg = days([30, 35, 40, 45, 55, 60, 65, 70, 75, 80, 85, 90])
  const outcomeNeg = days([3100, 3000, 2950, 2900, 2600, 2500, 2400, 2300, 2250, 2200, 2150, 2100])

  test("'neg' seam: outcome is higher when the driver is low", () => {
    const s = detectSeam(driverNeg, outcomeNeg, { expect: 'neg', minDelta: 150 })!
    expect(s.nPaired).toBe(12)
    expect(s.bucketDays).toBe(4)
    expect(s.outcomeAtLowDriver).toBeCloseTo(2987.5) // raw means preserved for display
    expect(s.outcomeAtHighDriver).toBeCloseTo(2175)
    expect(s.delta).toBe(813) // rounded delta (round(2987.5) − round(2175)) — what the gate judges
    expect(s.r!).toBeLessThan(-0.2)
    expect(s.meaningful).toBe(true)
  })

  // sleep hours (driver) ↑ → mood (outcome) ↑ — a clean 'pos' seam (sleep→mood).
  const driverPos = days([5.0, 5.3, 5.6, 5.9, 6.5, 6.8, 7.1, 7.4, 7.7, 8.0, 8.3, 8.6])
  const outcomePos = days([2.6, 2.8, 3.0, 3.2, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.0])

  test("'pos' seam at 1-decimal precision: outcome is higher when the driver is high", () => {
    const s = detectSeam(driverPos, outcomePos, { expect: 'pos', minDelta: 0.5, decimals: 1 })!
    expect(s.nPaired).toBe(12)
    expect(s.outcomeAtLowDriver).toBeCloseTo(2.9)
    expect(s.outcomeAtHighDriver).toBeCloseTo(4.7)
    expect(s.delta).toBeCloseTo(1.8) // rounded-to-0.1 delta: round(4.7,1) − round(2.9,1)
    expect(s.r!).toBeGreaterThan(0.2)
    expect(s.meaningful).toBe(true)
  })

  test("'pos' spec on a negatively-correlated series → not meaningful (sign must agree)", () => {
    const s = detectSeam(driverNeg, outcomeNeg, { expect: 'pos', minDelta: 150 })!
    expect(s.delta).toBeLessThan(0) // outcome is LOWER when the driver is high
    expect(s.meaningful).toBe(false)
  })

  // Disjoint odd/even dates: caffeine on day D, recovery on D+1. Only a +1 lag joins.
  const lagDriver = ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07', '2026-06-09', '2026-06-11', '2026-06-13', '2026-06-15', '2026-06-17']
    .map((date, i) => ({ date, value: 100 + i * 60 }))
  const lagOutcome = ['2026-06-02', '2026-06-04', '2026-06-06', '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-14', '2026-06-16', '2026-06-18']
    .map((date, i) => ({ date, value: 90 - i * 7 }))

  test('lag joins the outcome N days after the driver', () => {
    expect(detectSeam(lagDriver, lagOutcome, { expect: 'neg', lag: 1, minDelta: 5 })!.nPaired).toBe(9)
  })

  test('a same-day join (lag 0) on lagged data finds nothing → null', () => {
    expect(detectSeam(lagDriver, lagOutcome, { expect: 'neg', lag: 0, minDelta: 5 })).toBeNull()
  })

  test('null below the paired-days floor (never cries wolf on thin data)', () => {
    expect(detectSeam(driverNeg.slice(0, 5), outcomeNeg.slice(0, 5), { expect: 'neg', minDelta: 150 })).toBeNull()
  })

  test('a flat outcome has no gap → not meaningful', () => {
    const flat = driverNeg.map((d) => ({ date: d.date, value: 2500 }))
    expect(detectSeam(driverNeg, flat, { expect: 'neg', minDelta: 150 })!.meaningful).toBe(false)
  })

  test('a flat driver has no variance → r null → not meaningful', () => {
    const flat = driverNeg.map((d) => ({ date: d.date, value: 50 }))
    expect(detectSeam(flat, outcomeNeg, { expect: 'neg', minDelta: 150 })!.meaningful).toBe(false)
  })

  test('drops null / ≤0 values on BOTH sides as no-reading sentinels', () => {
    // Knock out 4 driver days (null/0) and 2 outcome days — only fully-paired,
    // positive-on-both-sides days survive the join.
    const driver = driverNeg.map((d, i) => ({ date: d.date, value: i < 2 ? null : i < 4 ? 0 : d.value }))
    const outcome = outcomeNeg.map((d, i) => ({ date: d.date, value: i >= 10 ? 0 : d.value }))
    // 12 days − 4 dropped driver days (i 0–3) − 2 dropped outcome days (i 10–11) = 6 paired.
    const s = detectSeam(driver, outcome, { expect: 'neg', minPaired: 4, minDelta: 150 })
    expect(s!.nPaired).toBe(6)
  })

  test('a tiny gap stays under the delta gate', () => {
    const tiny = driverNeg.map((d) => ({ date: d.date, value: d.value < 50 ? 2520 : 2500 }))
    expect(detectSeam(driverNeg, tiny, { expect: 'neg', minDelta: 150 })!.meaningful).toBe(false)
  })

  test('opt-in significance rejects a moderate-but-insignificant correlation at the floor', () => {
    // r ≈ 0.46 on 8 pairs: clears |r| ≥ 0.3 but NOT a one-sided p < 0.05 (needs |r| ≈ 0.62).
    // Without the significance gate it would fire on noise; with it, it stays silent.
    const drv = days([1, 2, 3, 4, 5, 6, 7, 8])
    const out = days([3, 6, 2, 5, 8, 3, 6, 7])
    expect(detectSeam(drv, out, { expect: 'pos', minPaired: 8, minDelta: 0.5, minAbsR: 0.3 })!.meaningful).toBe(true)
    expect(detectSeam(drv, out, { expect: 'pos', minPaired: 8, minDelta: 0.5, minAbsR: 0.3, significance: true })!.meaningful).toBe(false)
  })

  test('opt-in significance still passes a strong, real correlation', () => {
    expect(detectSeam(driverPos, outcomePos, { expect: 'pos', minDelta: 0.5, decimals: 1, significance: true })!.meaningful).toBe(true)
  })
})

describe('pearsonSignificant (one-sided p<0.05 floor, adaptive to n)', () => {
  test('r = 0 is never significant', () => {
    expect(pearsonSignificant(0, 30)).toBe(false)
  })
  test('boundary at n=8 (critical |r| ≈ 0.62)', () => {
    expect(pearsonSignificant(0.62, 8)).toBe(false)
    expect(pearsonSignificant(0.63, 8)).toBe(true)
  })
  test('boundary at n=30 (critical |r| ≈ 0.31) — looser as data grows', () => {
    expect(pearsonSignificant(0.30, 30)).toBe(false)
    expect(pearsonSignificant(0.31, 30)).toBe(true)
  })
  test('uses magnitude, so a strong negative r is significant', () => {
    expect(pearsonSignificant(-0.8, 8)).toBe(true)
  })
  test('fewer than 3 points can never be significant', () => {
    expect(pearsonSignificant(0.99, 2)).toBe(false)
  })
})

describe('sentimentScore (journal → number)', () => {
  test('positive vent reads positive', () => {
    expect(sentimentScore('feeling really good and grateful today, productive')!).toBeGreaterThan(0)
  })
  test('low vent reads negative', () => {
    expect(sentimentScore('exhausted, anxious and overwhelmed, everything feels awful')!).toBeLessThan(0)
  })
  test('negation flips polarity ("not bad" is not negative)', () => {
    expect(sentimentScore('not bad at all')!).toBeGreaterThan(0)
  })
  test('intensifier deepens magnitude', () => {
    const plain = sentimentScore('tired')!
    const strong = sentimentScore('really tired')!
    expect(strong).toBeLessThanOrEqual(plain)
  })
  test('a note with no emotional words returns null (no fabricated neutral)', () => {
    expect(sentimentScore('went to the store and bought milk and bread')).toBeNull()
  })
  test('empty / whitespace returns null', () => {
    expect(sentimentScore('')).toBeNull()
    expect(sentimentScore('   ')).toBeNull()
  })
  test('score stays within [-1, 1]', () => {
    const s = sentimentScore('awful terrible horrible miserable hopeless')!
    expect(s).toBeGreaterThanOrEqual(-1)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('sentimentToMood (−1..1 → 1..5)', () => {
  test('maps the endpoints and midpoint', () => {
    expect(sentimentToMood(-1)).toBe(1)
    expect(sentimentToMood(0)).toBe(3)
    expect(sentimentToMood(1)).toBe(5)
  })
  test('clamps out-of-range valence', () => {
    expect(sentimentToMood(-2)).toBe(1)
    expect(sentimentToMood(2)).toBe(5)
  })
})

describe('moodTrend', () => {
  const mk = (moods: number[]) => moods.map((mood, i) => ({ mood, date: `d${i}` }))

  test('null below the day floor', () => {
    expect(moodTrend(mk([2, 3]))).toBeNull()
  })
  test('flags a low recent stretch', () => {
    const t = moodTrend(mk([2, 2, 1, 2, 3]))!
    expect(t.low).toBe(true)
    expect(t.recentAvg).toBeCloseTo(2, 1)
  })
  test('a good stretch is not low', () => {
    expect(moodTrend(mk([4, 5, 4, 4, 5]))!.low).toBe(false)
  })
  test('detects a downward shift vs the prior window', () => {
    // newest-first: recent 7 low, prior 7 high → direction down
    const t = moodTrend(mk([2, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4]))!
    expect(t.direction).toBe('down')
    expect(t.priorAvg).toBeGreaterThan(t.recentAvg)
  })
})

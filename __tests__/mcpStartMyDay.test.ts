import { assembleNudges, type BriefingInputs } from '@/mcp/src/nudges'
import { selectLeadInsight, scoreInsight, shapeStartMyDay, readoutLines } from '@/mcp/src/startMyDay'
import type { Nudge, Briefing } from '@/mcp/src/nudges'
import type {
  Profile, SleepData, WeightData, NutritionData, WorkoutData,
  SubscriptionData, WaterData, GoalsData, SupplementsData, BusinessData, BrandData, SleepEntry,
} from '@/mcp/src/queries'

const TODAY = '2026-06-20'

function sleepEntry(partial: Partial<SleepEntry> = {}): SleepEntry {
  return { date: TODAY, provider: 'whoop', sleepHours: null, sleepPerf: null, recovery: null, hrv: null, rhr: null, strain: null, ...partial }
}
function sleep(partial: Partial<SleepData> = {}): SleepData {
  return { entries: [], prefs: { wakeTime: 6.5, sleepNeedHours: 8, recoveryLevel: null, peakHour: null }, hasWearable: true, ...partial }
}
function nutrition(partial: Partial<NutritionData> = {}): NutritionData {
  return {
    onboarded: false, kcalTarget: 2400, proteinTarget: 180, carbsTarget: null, fatTarget: null,
    goalOutcome: null, adaptiveEnabled: true,
    today: { kcal: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, names: [] },
    recentAvgKcal: null, recentAvgProtein: null, recentLoggedDays: 0,
    adherence: { loggedDays: 0, avgKcal: null, avgProtein: null, onTargetDays: 0, daysUnder: 0, daysOver: 0, proteinHitDays: 0, adherence: null },
    ...partial,
  }
}
function inputs(partial: Partial<BriefingInputs> = {}): BriefingInputs {
  const base: BriefingInputs = {
    profile: { firstName: 'Alex', sex: 'm', age: 28, heightCm: 180, startingWeightKg: 82, units: 'metric', goal: null, focusAreas: [], tier: 'pro', subscriptionStatus: 'active', currentPeriodEnd: null } as Profile,
    sleep: sleep(),
    weights: { entries: [], latestKg: null, deltaKg: null, trend: null, windowDays: 30, weeklyRate: null, nEntries: 0 } as WeightData,
    nutrition: nutrition(),
    nutritionDaily: [],
    moodDaily: [],
    workouts: { entries: [], submittedLast7: 0, windowDays: 14 } as WorkoutData,
    subs: { currency: 'CHF', subs: [], totalMonthlyChf: 0, totalYearlyChf: 0 } as SubscriptionData,
    water: { hasData: false, unit: 'bottle', todayServings: 0, recentAvgServings: null, caffeineMgPerDay: null, targetServings: null } as WaterData,
    goals: { hasData: false, streakCurrent: 0, streakLongest: 0, activeGoals: 0, dueToday: 0, completedToday: 0, bigGoals: [], dueTodayGoals: [], dueTomorrowGoals: [] } as GoalsData,
    supplements: { hasData: false, total: 0, takenToday: 0, lowCount: 0, names: [] } as SupplementsData,
    business: { hasData: false, ventures: [] } as BusinessData,
    peakStimulants: { hasData: false, todayCount: 0, caffeineMgToday: null, substances: [], latestEnergy: null, tolerance: null },
    brand: { hasData: false, brandCount: 0, names: [], totalFollowers: 0, followerDelta7: null, kpis: [], goals: [], openGoals: 0, overdueGoals: 0, goalsDoneRecently: 0, connectorMetrics: [], connectorProviders: [], shipCadence: null } as BrandData,
    notes: [],
    todayKey: TODAY,
  }
  return { ...base, ...partial }
}

describe('no-signal recovery honesty', () => {
  it('treats recovery 0 as no reading, never "Drained"', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: [sleepEntry({ recovery: 0 })] }) }))
    const drained = ns.find((n) => /drained/i.test(n.title) || /drained/i.test(n.detail))
    expect(drained).toBeUndefined()
    // With no other recovery signal, there is no synthesis "today's call" headline.
    expect(ns.find((n) => n.domain === 'today')).toBeUndefined()
  })

  it('still fires a real low-recovery call for a genuine low (recovery 28)', () => {
    const ns = assembleNudges(inputs({ sleep: sleep({ entries: [sleepEntry({ recovery: 28 })] }) }))
    const today = ns.find((n) => n.domain === 'today')
    expect(today?.title).toMatch(/Drained/)
  })
})

const n = (domain: Nudge['domain'], severity: Nudge['severity'], title = `${domain} ${severity}`): Nudge =>
  ({ domain, severity, title, detail: `${title} detail` })

describe('selectLeadInsight', () => {
  it('returns null for no nudges', () => {
    expect(selectLeadInsight([])).toBeNull()
  })

  it('never leads with coverage (always-present plumbing)', () => {
    expect(selectLeadInsight([n('coverage', 'info')])).toBeNull()
  })

  it('an urgent nudge outranks any info nudge', () => {
    const lead = selectLeadInsight([n('today', 'info'), n('training', 'urgent')])
    expect(lead?.domain).toBe('training')
  })

  it("a low-mood info reach-out outranks the generic \"today's call\" info", () => {
    const lead = selectLeadInsight([n('today', 'info'), n('mind', 'info'), n('coverage', 'info')])
    expect(lead?.domain).toBe('mind')
  })

  it('on a calm day the synthesis "today" leads over bare coverage/affirmations', () => {
    const lead = selectLeadInsight([n('today', 'info'), n('coverage', 'info'), n('supplements', 'info')])
    expect(lead?.domain).toBe('today')
  })

  it('a real low-mood reach-out leads over a routine training suggest', () => {
    const lead = selectLeadInsight([n('today', 'suggest'), n('mind', 'info')])
    expect(lead?.domain).toBe('mind')
  })

  it('a genuine urgent signal still outranks the low-mood reach-out', () => {
    const lead = selectLeadInsight([n('mind', 'info'), n('today', 'urgent')])
    expect(lead?.domain).toBe('today')
  })

  it('scoreInsight ranks urgent above suggest above info', () => {
    expect(scoreInsight(n('sleep', 'urgent'))).toBeGreaterThan(scoreInsight(n('sleep', 'suggest')))
    expect(scoreInsight(n('sleep', 'suggest'))).toBeGreaterThan(scoreInsight(n('sleep', 'info')))
  })

  it('a caffeine→recovery seam (peak) leads over a routine single-domain suggest', () => {
    const lead = selectLeadInsight([n('training', 'suggest'), n('peak', 'suggest')])
    expect(lead?.domain).toBe('peak')
  })

  it('a low-mood reach-out still outranks the caffeine seam (in-your-corner first)', () => {
    const lead = selectLeadInsight([n('peak', 'suggest'), n('mind', 'info')])
    expect(lead?.domain).toBe('mind')
  })
})

const briefing = (nudges: Briefing['nudges'], greetingName: string | null = 'Alex'): Briefing =>
  ({ generatedAt: '2026-06-20T08:00:00.000Z', dayKey: '2026-06-20', greetingName, nudges })

describe('shapeStartMyDay', () => {
  it('opens with a warm Howdy + name', () => {
    const out = shapeStartMyDay(briefing([n('today', 'info')]))
    expect(out).toMatch(/Howdy, Alex\./)
  })

  it('falls back to "there" when no name is set', () => {
    const out = shapeStartMyDay(briefing([n('today', 'info')], null))
    expect(out).toMatch(/Howdy, there\./)
  })

  it('leads with the single best insight and does not repeat it in the readout', () => {
    const nudges = [
      n('mind', 'info', "You've seemed low this week — I'm here"),
      n('today', 'info', "Today's call: train as planned. Recovery 72"),
    ]
    const out = shapeStartMyDay(briefing(nudges))
    // The lead (mind reach-out) headlines.
    expect(out).toMatch(/The one thing that matters most today — You've seemed low this week/)
    // It is NOT also listed as a readout bullet.
    expect(out).not.toMatch(/• You've seemed low this week/)
    // A real, write-tool-backed offer rides under a mind lead.
    expect(out).toMatch(/right here/i)
    // The non-lead domain still shows in the readout.
    expect(out).toMatch(/• Today's call: train as planned/)
  })

  it('readoutLines excludes the lead and coverage', () => {
    const lead = n('today', 'info')
    const lines = readoutLines([lead, n('coverage', 'info'), n('hydration', 'info')], lead)
    expect(lines.join('\n')).not.toMatch(/coverage/i)
    expect(lines.join('\n')).not.toContain(lead.title)
    expect(lines.join('\n')).toContain('hydration')
  })

  it("omits the lead's whole domain so nothing is mentioned twice (e.g. caffeine seam leads + caffeine-load line)", () => {
    // Both the caffeine→recovery seam and the caffeine-load nudge are domain 'peak'.
    // When the seam leads, the load line must NOT also appear in the readout.
    const lead = n('peak', 'suggest', 'Caffeine seam (the lead)')
    const lines = readoutLines([lead, n('peak', 'info', 'Stimulants: 2 today, 190 mg'), n('hydration', 'info')], lead)
    expect(lines.join('\n')).not.toMatch(/Stimulants|seam/i)
    expect(lines.join('\n')).toContain('hydration')
  })

  it('a low-mood note never vanishes: shows in the readout when an urgent signal leads', () => {
    const out = shapeStartMyDay(briefing([
      n('today', 'urgent', "Today's call: rest. Recovery 28 (Drained)"),
      n('mind', 'info', "You've seemed low this week — I'm here"),
    ]))
    // Urgent leads the headline.
    expect(out).toMatch(/The one thing that matters most today — Today's call: rest/)
    // The low-mood reach-out is still surfaced as a readout bullet.
    expect(out).toMatch(/• You've seemed low this week/)
  })

  it('handles a coverage-only briefing without crashing', () => {
    const out = shapeStartMyDay(briefing([n('coverage', 'info')]))
    expect(out).toMatch(/Howdy, Alex\./)
    expect(out).toMatch(/good place to be/)
  })
})

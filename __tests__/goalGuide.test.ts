import { buildGoalGuide, guideGroundedWhy, guideProjectionLead, supplementAdherence, type GuideSignals } from '@/lib/insights/goalGuide'

const goal = (title: string, category: string | null = null) => ({ title, cleanTitle: null, category })

/** A lift whose top set never moves across `weeks` weekly sessions — a stall. */
function stalledLift(id: string, name: string, weeks = 5, weight = 185, reps = 5) {
  const sessions = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(Date.UTC(2026, 4, 1 + i * 7)) // May 1, May 8, ...
    return { date: d.toISOString().slice(0, 10), topWeight: weight, topReps: reps }
  })
  return { id, name, sessions }
}

/** A lift whose top set climbs every week — real progressive overload. */
function progressingLift(id: string, name: string, weeks = 5, start = 175) {
  const sessions = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(Date.UTC(2026, 4, 1 + i * 7))
    return { date: d.toISOString().slice(0, 10), topWeight: start + i * 5, topReps: 5 }
  })
  return { id, name, sessions }
}

/** A lift climbing at an exact weekly pace (kg), from a chosen start. */
function climbing(id: string, name: string, start: number, step: number, weeks = 6) {
  const sessions = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(Date.UTC(2026, 4, 1 + i * 7))
    return { date: d.toISOString().slice(0, 10), topWeight: start + i * step, topReps: 5 }
  })
  return { id, name, sessions }
}

describe('buildGoalGuide', () => {
  it('only ever recommends real, shipped Vitality routes (never vaporware)', () => {
    // Titles with a real body/money/audience theme MUST get a guide...
    const themed = [
      'bench 225', 'lose fat', 'sleep 8 hours', 'reach 1000 subscribers',
      'save 10k', 'drink more water', 'eat more protein',
    ]
    for (const t of themed) {
      const items = buildGoalGuide(goal(t), [])
      expect(items.length).toBeGreaterThan(0)
      for (const it of items) expect(it.href.startsWith('/app/')).toBe(true)
    }
    // ...and a goal with no theme and no body-adjacent category gets the
    // honest NOTES lever (TRAIN 4: every goal has a lightbulb) — a real /app
    // route, never a body or money lever (Alex, 2026-07-10: a "better
    // workflow" goal must never be told to weigh in daily).
    for (const t of ['be happier', 'i need a better workflow', '']) {
      const items = buildGoalGuide(goal(t), [])
      expect(items.map(i => i.module)).toEqual(['notes'])
      expect(items[0].href).toBe('/app/mentor')
    }
    expect(buildGoalGuide(goal('level up my career', 'career'), []).map(i => i.module)).toEqual(['notes'])
    expect(buildGoalGuide(goal('see friends more', 'people'), []).map(i => i.module)).toEqual(['notes'])
  })

  it('leads a strength goal with the workout logger', () => {
    const items = buildGoalGuide(goal('225-Pound Bench Press For 5', 'fitness'), [])
    expect(items[0].module).toBe('train')
    expect(items[0].href).toBe('/app/fitness/log')
  })

  it('routes a followers goal to brand only — never a health module', () => {
    const items = buildGoalGuide(goal('Reach 1,000 Subscribers'), [])
    expect(items.map((i) => i.module)).toContain('brand')
    expect(items.every((i) => i.module === 'brand')).toBe(true)
  })

  it('routes a money goal to finance', () => {
    const items = buildGoalGuide(goal('Save 10k this year'), [])
    expect(items.map((i) => i.module)).toContain('finance')
  })

  it('routes a sleep goal to recovery', () => {
    const items = buildGoalGuide(goal('Fix my sleep'), [])
    expect(items[0].module).toBe('recovery')
  })

  it('marks an active module as a quick-link and inactive ones as demos', () => {
    const items = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    const train = items.find((i) => i.module === 'train')!
    expect(train.using).toBe(true)
    const others = items.filter((i) => i.module !== 'train')
    expect(others.length).toBeGreaterThan(0)
    expect(others.every((i) => i.using === false)).toBe(true)
  })

  it('adapts the copy to the user: fresh vs already-logging differ', () => {
    const fresh = buildGoalGuide(goal('get stronger', 'fitness'), [])
    const active = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    const f = fresh.find((i) => i.module === 'train')!
    const a = active.find((i) => i.module === 'train')!
    expect(f.using).toBe(false)
    expect(a.using).toBe(true)
    expect(a.why).not.toBe(f.why) // already-logging gets a deeper, different push
  })

  it('carries a direct "why" with a verbatim key phrase, no em dashes (both variants)', () => {
    const titles = ['225-Pound Bench Press For 5', 'lose fat', 'reach 1000 subscribers', 'save 10k', 'fix my sleep']
    const allMods = ['train', 'macros', 'weight', 'water', 'recovery', 'supplements', 'brand', 'finance'] as const
    for (const t of titles) {
      for (const active of [[] as typeof allMods[number][], [...allMods]]) {
        for (const it of buildGoalGuide(goal(t, 'fitness'), active)) {
          expect(it.why.length).toBeGreaterThan(20)
          expect(it.why).not.toContain('—')
          expect(it.why).toContain(it.key)
        }
      }
    }
  })

  it('keeps the guide small (<= 3) and never empty', () => {
    const items = buildGoalGuide(goal('get lean and strong', 'fitness'), [])
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(3)
  })
})

describe('buildGoalGuide — word-bound + category-gated themes (no wrong-domain levers)', () => {
  it('kills the substring false positives: everyday words never route a body or money lever', () => {
    // 'save'/'spend' only count for money goals; 'eat' inside create, 'row' inside
    // grow, 'mile' inside smile, 'gain'/'cut' as plain verbs never fire at all.
    const empties: [string, string | null][] = [
      ['save my marriage', 'people'],
      ['spend more time with family', 'people'],
      ['run my business', 'career'],
      ['gain confidence', 'mind'],
      ['create a podcast', 'craft'],
      ['grow as a person', 'general'],
      ['tired of being broke', 'general'],
      ['smile more', 'people'],
      ['cut screen time', 'mind'],
      ['impress my boss', 'career'],
    ]
    for (const [title, cat] of empties) {
      // TRAIN 4: no goal is leverless — these all fall to the honest notes
      // lever, and NEVER a body or money module.
      expect(buildGoalGuide(goal(title, cat), []).map(i => i.module)).toEqual(['notes'])
    }
  })

  it('keeps the loose verbs working where the category agrees (save 10k stays finance)', () => {
    expect(buildGoalGuide(goal('save for an engagement ring', 'money'), [])[0].module).toBe('finance')
    expect(buildGoalGuide(goal('save 10k', 'money'), [])[0].module).toBe('finance')
    expect(buildGoalGuide(goal('save 10k'), [])[0].module).toBe('finance') // uncategorized keeps working
  })

  it('an unambiguous domain word still wins for any category', () => {
    expect(buildGoalGuide(goal('grow my net worth', 'career'), [])[0].module).toBe('finance')
    expect(buildGoalGuide(goal('reach 1000 subscribers', 'career'), [])[0].module).toBe('brand')
    expect(buildGoalGuide(goal('eat more protein', 'general'), [])[0].module).toBe('macros')
    expect(buildGoalGuide(goal('fix my sleep schedule', 'health'), [])[0].module).toBe('recovery')
  })

  it('a bench goal is strength, never nutrition (Beat is not eat)', () => {
    const items = buildGoalGuide(goal('Beat my bench PR', 'fitness'), [])
    expect(items[0].module).toBe('train')
  })

  it("a later rule's STRONG word beats an earlier rule's loose one (tired of being fat = body comp, not sleep)", () => {
    for (const cat of ['health', null, 'general', 'fitness']) {
      const mods = buildGoalGuide(goal('tired of being fat and broke', cat), []).map(i => i.module)
      expect(mods[0]).toBe('weight')
      expect(mods).not.toContain('recovery')
    }
  })

  it('an engagement RING savings goal is finance, never brand, even before triage', () => {
    for (const cat of [null, 'money']) {
      expect(buildGoalGuide(goal('save for an engagement ring', cat), [])[0].module).toBe('finance')
    }
  })

  it("a money 10k never earns the cardio lever ('10k' only reads as a run for a runnable category)", () => {
    expect(buildGoalGuide(goal('save 10k', 'money'), [])[0].module).toBe('finance')
    expect(buildGoalGuide(goal('save 10k'), [])[0].module).toBe('finance')
    // ...while a real race keeps it
    expect(buildGoalGuide(goal('run a 10k', 'fitness'), [])[0].module).toBe('train')
    expect(buildGoalGuide(goal('run a 5k'), [])[0].module).toBe('train')
  })

  it('health-category vice goals get the notes lever, never the scale', () => {
    for (const t of ['stop vaping', 'quit smoking', 'stay sober', 'drink less alcohol']) {
      expect(buildGoalGuide(goal(t, 'health'), []).map(i => i.module)).toEqual(['notes'])
    }
    // "Quit Bad Habits" is a vice-family goal too: it must never earn the
    // weigh-in/meals machinery (the launch taste-test card that said "log a
    // weigh-in" over a meals chip on a habits goal).
    for (const t of ['quit bad habits', 'break my bad habits', 'stop bad habits']) {
      expect(buildGoalGuide(goal(t, 'health'), []).map(i => i.module)).toEqual(['notes'])
    }
    // ...but a health goal with a real body word keeps its body lever
    expect(buildGoalGuide(goal('quit sugar', 'health'), [])[0].module).toBe('macros')
    expect(buildGoalGuide(goal('get healthier and lose weight', 'health'), [])[0].module).toBe('weight')
    // and a plain non-vice health goal keeps the weight/macros default
    expect(buildGoalGuide(goal('feel better day to day', 'health'), []).map(i => i.module)).toEqual(['weight', 'macros'])
  })

  it('alcohol-quit goals mute the scale, but hydration goals never do', () => {
    // The residual hole: these slipped past the old vice regex and grabbed the
    // weigh-in/meals lever. Now they take the honest notes floor.
    for (const t of [
      'quit drinking', 'stop drinking', 'drinking less',
      'fewer drinks', 'give up beer', 'less wine', 'stop the hangovers', 'lay off the booze',
    ]) {
      expect(buildGoalGuide(goal(t, 'health'), []).map(i => i.module)).toEqual(['notes'])
    }
    // KNOWN EDGE (resolved by the registry-router next window): "cut back on
    // drinking" collides with the body-comp "cut" strong rule in pass-1, so it
    // still shows a body lever. The picker corrects it in one tap. Not muted
    // here on purpose - reordering theme-matching is backbone work, not a patch.
    // The invariant that keeps the widening safe: a hydration goal must never be
    // read as a vice. "drink more water" keeps its water lever.
    expect(buildGoalGuide(goal('drink more water', 'health'), ['water']).some(i => i.module === 'water')).toBe(true)
    expect(buildGoalGuide(goal('drink a gallon of water a day', 'health'), ['water']).some(i => i.module === 'water')).toBe(true)
  })
})

describe('guideGroundedWhy', () => {
  const social = {
    platform: 'youtube',
    series: [
      { date: '2026-06-01', count: 800 },
      { date: '2026-06-08', count: 850 },
      { date: '2026-06-15', count: 900 },
    ],
  }

  it('returns the full grounded why only when the brain fired, null when canned', () => {
    const canned = buildGoalGuide(goal('reach 1000 subscribers', 'audience'), [])
    expect(guideGroundedWhy(canned, 'brand')).toBeNull()

    const grounded = buildGoalGuide(goal('reach 1000 subscribers', 'audience'), [], { social })
    expect(guideGroundedWhy(grounded, 'brand')).toContain('subscribers grow')
    expect(guideGroundedWhy(grounded, 'train')).toBeNull() // no such row
    expect(guideGroundedWhy(undefined, 'brand')).toBeNull()
  })

  it('projection copy says "1 week", never "1 weeks"', () => {
    const items = buildGoalGuide(goal('reach 950 subscribers', 'audience'), [], { social })
    const why = guideGroundedWhy(items, 'brand')!
    expect(why).toContain('1 week at this pace')
    expect(why).not.toContain('1 weeks')
  })
})

describe('buildGoalGuide: injury/rehab fitness goals take the gentle recovery route', () => {
  const GENTLE_WHY = 'Ease back in and let recovery lead. Track your sleep and how you feel each day, and add load only when your body says yes.'
  const injuryTitles = [
    'rehab my knee',
    'recover from shoulder surgery',
    'come back from my injury',
    'squat without pain',
    'physio every week',
  ]

  it('routes an injury fitness goal to ONE recovery item with gentle copy, never "beat last time"', () => {
    for (const t of injuryTitles) {
      const items = buildGoalGuide(goal(t, 'fitness'), [])
      expect(items.map(i => i.module)).toEqual(['recovery'])
      expect(items[0].href).toBe('/app/vitals')
      expect(items[0].why).toBe(GENTLE_WHY)
      expect(items[0].why).toContain(items[0].key) // key verbatim inside why
      expect(items[0].why.toLowerCase()).not.toContain('beat last time')
    }
  })

  it('matches on the RAW title too, in case cleanTitle stripped the injury words', () => {
    const items = buildGoalGuide({ title: 'rehab my acl tear', cleanTitle: 'Get my knee strong', category: 'fitness' }, [])
    expect(items.map(i => i.module)).toEqual(['recovery'])
    expect(items[0].why).toContain('let recovery lead')
  })

  it('never lets a brain override the gentle copy with a stall strike or a push', () => {
    const signals: GuideSignals = {
      lifts: [stalledLift('squat', 'Squat', 6)],
      recovery: { nights: Array.from({ length: 10 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, sleepH: 7.5, recovery: 70 })) },
    }
    const items = buildGoalGuide(goal('squat again after my injury', 'fitness'), ['train', 'recovery'], signals)
    expect(items.map(i => i.module)).toEqual(['recovery'])
    expect(items[0].why).toBe(GENTLE_WHY)
    expect(items[0].using).toBe(true) // activeSet still respected
  })

  it('is fitness-category gated: other categories keep their normal routes', () => {
    // a money goal mentioning pain keeps the finance lever
    expect(buildGoalGuide(goal('save 10k even if it is a pain', 'money'), []).map(i => i.module)).toEqual(['finance'])
    // an uncategorized injury title takes the gentle route via the
    // deterministic stand-in (the gentle comeback must not die with triage)
    const uncategorized = buildGoalGuide(goal('rehab my knee', null), [])
    expect(uncategorized.map(i => i.module)).toEqual(['recovery'])
    expect(uncategorized[0].why).toBe(GENTLE_WHY)
  })

  it('a plain fitness goal still gets the normal train-first guide', () => {
    const items = buildGoalGuide(goal('bench 100kg', 'fitness'), [])
    expect(items[0].module).toBe('train')
    expect(items[0].why).toContain('Beat last time')
  })

  it('guideGroundedWhy treats the gentle injury copy as CANNED, never a data-grounded read', () => {
    const items = buildGoalGuide(goal('rehab my knee', 'fitness'), [])
    expect(guideGroundedWhy(items, 'recovery')).toBeNull()
    expect(guideProjectionLead(items, 'recovery')).toBeNull()
  })
})

describe('buildGoalGuide — the brain (deterministic personal call-outs)', () => {
  const train = (signals: GuideSignals, title = 'get stronger') =>
    buildGoalGuide(goal(title, 'fitness'), ['train'], signals).find((i) => i.module === 'train')!

  it('names the specific stalled lift when the goal is about it', () => {
    const signals: GuideSignals = { lifts: [stalledLift('bench', 'Bench Press')] }
    const t = train(signals, 'bench 225 for 5')
    // The bold call-out replaces the generic line and names the actual lift.
    expect(t.why.toLowerCase()).toContain('bench press')
    const generic = buildGoalGuide(goal('bench 225 for 5', 'fitness'), ['train']).find((i) => i.module === 'train')!
    expect(t.why).not.toBe(generic.why) // brain overrode the canned copy
  })

  it('fires the "most lifts stalled" strike for a vague strength goal', () => {
    const signals: GuideSignals = {
      lifts: [stalledLift('bench', 'Bench Press'), stalledLift('squat', 'Back Squat')],
    }
    const t = train(signals)
    expect(t.why.toLowerCase()).toMatch(/stalled|push a little harder/)
    expect(t.why.length).toBeGreaterThan(60) // golden-URL-style FILLING, not a one-liner
  })

  it('does NOT fire when lifts are actually progressing', () => {
    const signals: GuideSignals = {
      lifts: [progressingLift('bench', 'Bench Press'), progressingLift('squat', 'Back Squat')],
    }
    const t = train(signals)
    const active = buildGoalGuide(goal('get stronger', 'fitness'), ['train']).find((i) => i.module === 'train')!
    expect(t.why).toBe(active.why) // no stall → fall back to the normal active copy
  })

  it('does not fire the general strike on a goal tied to a healthy lift', () => {
    // Bench is fine, squat stalled. A bench goal should not get nagged about squat.
    const signals: GuideSignals = {
      lifts: [progressingLift('bench', 'Bench Press'), stalledLift('squat', 'Back Squat')],
    }
    const t = train(signals, 'bench 225 for 5')
    expect(t.why.toLowerCase()).not.toContain('most of your lifts') // not the general strike
    expect(t.why.toLowerCase()).not.toContain('squat') // never about the unrelated stalled lift
  })

  it('only touches the train item — a followers goal is never affected by lift signals', () => {
    const signals: GuideSignals = { lifts: [stalledLift('bench', 'Bench Press'), stalledLift('squat', 'Back Squat')] }
    const items = buildGoalGuide(goal('reach 1000 subscribers'), ['train'], signals)
    expect(items.every((i) => i.module === 'brand')).toBe(true)
    const plain = buildGoalGuide(goal('reach 1000 subscribers'), ['train'])
    expect(items.map((i) => i.why)).toEqual(plain.map((i) => i.why))
  })

  it('keeps the invariants on the personalized copy (verbatim key, no em dash, length)', () => {
    for (const signals of [
      { lifts: [stalledLift('bench', 'Bench Press')] } as GuideSignals,
      { lifts: [stalledLift('bench', 'Bench Press'), stalledLift('squat', 'Back Squat')] } as GuideSignals,
    ]) {
      for (const title of ['bench 225 for 5', 'get stronger']) {
        const t = train(signals, title)
        expect(t.why).toContain(t.key)
        expect(t.why).not.toContain('—')
        expect(t.why.length).toBeGreaterThan(20)
      }
    }
  })

  it('with no signals (generic user) behaves exactly as before', () => {
    const withEmpty = buildGoalGuide(goal('get stronger', 'fitness'), ['train'], {})
    const without = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    expect(withEmpty.map((i) => i.why)).toEqual(without.map((i) => i.why))
  })
})

describe('buildGoalGuide — the brain finds the hidden weakness capping a goal', () => {
  // Real exercise ids so the muscle lookup hits the real exerciseReferences:
  // bench_bb=chest, tri_pushdown=triceps, standing_ohp=shoulders.
  const benchGoal = 'bench 225 for 5'
  const trainFor = (lifts: GuideSignals['lifts']) =>
    buildGoalGuide(goal(benchGoal, 'fitness'), ['train'], { lifts }).find((i) => i.module === 'train')!
  const active = () =>
    buildGoalGuide(goal(benchGoal, 'fitness'), ['train']).find((i) => i.module === 'train')!

  it('names a stalled support lift that caps the goal (bench climbing, triceps stuck)', () => {
    const t = trainFor([progressingLift('bench_bb', 'Bench Press'), stalledLift('tri_pushdown', 'Tricep Pushdown')])
    expect(t.why.toLowerCase()).toContain('triceps') // the capping muscle
    expect(t.why).not.toBe(active().why) // upgraded past the canned line
    // never falsely claim the goal lift itself stalled — bench is climbing here
    expect(t.why.toLowerCase()).not.toMatch(/bench.*has not/)
  })

  it('flags a missing support muscle (benches, but no dedicated triceps or shoulders work)', () => {
    const t = trainFor([progressingLift('bench_bb', 'Bench Press')])
    expect(t.why.toLowerCase()).toContain('dedicated')
    expect(t.why.toLowerCase()).toMatch(/triceps|shoulders/)
  })

  it('invents no false weakness when every support is trained and progressing', () => {
    const t = trainFor([
      progressingLift('bench_bb', 'Bench Press'),
      progressingLift('tri_pushdown', 'Tricep Pushdown'),
      progressingLift('standing_ohp', 'Overhead Press'),
    ])
    expect(t.why.toLowerCase()).not.toContain('has not gone up') // no fake stall
    expect(t.why.toLowerCase()).not.toContain('no dedicated') // no fake gap
  })

  it('keeps the invariants on the weakness copy (verbatim key, no em dash, filling)', () => {
    for (const lifts of [
      [progressingLift('bench_bb', 'Bench Press'), stalledLift('tri_pushdown', 'Tricep Pushdown')],
      [progressingLift('bench_bb', 'Bench Press')],
    ] as GuideSignals['lifts'][]) {
      const t = trainFor(lifts)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(60)
    }
  })
})

describe('buildGoalGuide — the brain projects an on-track lift to its goal date', () => {
  // Bench climbing 2.5kg/wk, currently 92.5; goal 225 lb (= ~102kg), so ~4 weeks out.
  // Supports trained + progressing so no weakness fires and the projection runs.
  const lifts = () => [
    climbing('bench_bb', 'Bench Press', 80, 2.5),
    climbing('tri_pushdown', 'Tricep Pushdown', 30, 1),
    climbing('standing_ohp', 'Overhead Press', 45, 1),
  ]
  const trainOn = (title: string, targetDate: string | null, today: string) =>
    buildGoalGuide({ title, cleanTitle: null, category: 'fitness', targetDate }, ['train'], { lifts: lifts(), today })
      .find((i) => i.module === 'train')!

  it('lands ON the goal date, labels units, and converts pounds to kg', () => {
    const t = trainOn('225-Pound Bench Press For 5', '2026-07-18', '2026-06-21')
    expect(t.why.toLowerCase()).toContain('right on') // ETA near the goal date
    expect(t.why).toContain('July 18')
    expect(t.why).toContain('225 lb') // states the goal in pounds
    expect(t.why).toContain('kg') // and labels his kg lifts/gap
    // If pounds were NOT converted, the gap would be ~130kg and it would read "past", not "right on".
  })

  it('says you are AHEAD (before the date) when the goal date is far out', () => {
    const t = trainOn('225-Pound Bench Press For 5', '2026-09-01', '2026-06-21')
    expect(t.why.toLowerCase()).toContain('before your')
    expect(t.why).toContain('September 1')
  })

  it('warns you are a little PAST when the goal date is too soon', () => {
    const t = trainOn('225-Pound Bench Press For 5', '2026-06-28', '2026-06-21')
    expect(t.why.toLowerCase()).toContain('past your')
    expect(t.why).toContain('June 28')
  })

  it('shows the gap with units and says what it means', () => {
    const t = trainOn('225-Pound Bench Press For 5', '2026-07-18', '2026-06-21')
    expect(t.why.toLowerCase()).toMatch(/to go/) // explicit remaining gap
    expect(t.why.toLowerCase()).toMatch(/\d+(\.\d)? kg/) // a number with a unit
  })

  it('renders the gap in pounds for an imperial user', () => {
    const t = buildGoalGuide(
      { title: '225-Pound Bench Press For 5', cleanTitle: null, category: 'fitness', targetDate: '2026-07-18' },
      ['train'],
      { lifts: lifts(), today: '2026-06-21', units: 'imperial' },
    ).find((i) => i.module === 'train')!
    expect(t.why).toContain('lb')
    expect(t.why).not.toMatch(/\bkg\b/) // imperial user never sees kg
  })

  it('falls back to a pace-only line when the goal states no target number', () => {
    const t = trainOn('bigger bench', null, '2026-06-21')
    expect(t.why.toLowerCase()).toContain('climbing about')
    expect(t.why.toLowerCase()).toContain('a week')
    expect(t.why.toLowerCase()).not.toContain('to go') // no target gap
  })

  it('keeps the invariants on every projection variant', () => {
    for (const date of ['2026-07-18', '2026-09-01', '2026-06-28', null]) {
      const t = trainOn('225-Pound Bench Press For 5', date, '2026-06-21')
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(60)
    }
  })

  // THE unit-fidelity bug: the raw title has no unit word, the AI cleanTitle does.
  // On a kg account this used to read "225 kg, 140 kg to go" (wrong) because the
  // brain sniffed only the raw title. It must read the goal's OWN unit (pounds).
  it('reads the goal unit from the cleanTitle when the raw title omits it (kg account)', () => {
    const t = buildGoalGuide(
      { title: '225 bench', cleanTitle: '225-Pound Bench Press For 5', category: 'fitness', targetDate: '2026-07-18' },
      ['train'],
      { lifts: lifts(), today: '2026-06-21', units: 'metric' },
    ).find((i) => i.module === 'train')!
    expect(t.why).toContain('225 lb')                 // the goal speaks pounds, its own unit
    expect(t.why).toContain('kg')                     // converted for the kg account
    expect(t.why.toLowerCase()).toContain('right on') // 102kg target ~4wk out lands on July 18
    expect(t.why).not.toContain('225 kg')             // never the account's unit on the goal number
  })

  // A stored progress_unit is the single source of truth and wins over the text.
  it('reads the goal unit from a stored progress unit', () => {
    const t = buildGoalGuide(
      { title: '225 bench', cleanTitle: null, category: 'fitness', targetDate: '2026-07-18', progressUnit: 'lb' },
      ['train'],
      { lifts: lifts(), today: '2026-06-21', units: 'metric' },
    ).find((i) => i.module === 'train')!
    expect(t.why).toContain('225 lb')
    expect(t.why).not.toContain('225 kg')
  })

  // No stated unit anywhere → fall back to the ACCOUNT unit, never silently kg.
  it('treats an unlabeled number as the account unit for an imperial user', () => {
    const t = buildGoalGuide(
      { title: '225 bench', cleanTitle: null, category: 'fitness', targetDate: '2026-07-18' },
      ['train'],
      { lifts: lifts(), today: '2026-06-21', units: 'imperial' },
    ).find((i) => i.module === 'train')!
    expect(t.why).not.toMatch(/\bkg\b/) // an imperial user never sees kg on an unlabeled goal
  })
})

describe('buildGoalGuide — the brain personalizes the weight row', () => {
  /** A weigh-in series over distinct days at a fixed kg/step pace. */
  function weighSeries(startKg: number, stepKg: number, points = 5) {
    return Array.from({ length: points }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 1 + i * 3))
      return { date: d.toISOString().slice(0, 10), kg: startKg + i * stepKg }
    })
  }
  const weightRow = (weighIns: { date: string; kg: number }[], direction: 'lose' | 'gain' | 'maintain' | null) =>
    buildGoalGuide(goal('lose fat'), ['weight'], { weighIns, weightDirection: direction, units: 'metric' })
      .find((i) => i.module === 'weight')!

  it('calls a clean cut when the scale is dropping on a fat-loss goal', () => {
    const t = weightRow(weighSeries(80, -0.3), 'lose')
    expect(t.why.toLowerCase()).toContain('down about')
    expect(t.why).toContain('kg')
    expect(t.why.toLowerCase()).not.toContain('trust the trend line') // upgraded past canned
  })

  it('flags a stalled cut when the scale is flat', () => {
    const t = weightRow(weighSeries(80, 0), 'lose')
    expect(t.why.toLowerCase()).toContain('stall')
  })

  it('calls a lean gain when bulking and the scale is rising', () => {
    const t = buildGoalGuide(goal('lean bulk'), ['weight'], { weighIns: weighSeries(70, 0.25), weightDirection: 'gain', units: 'metric' })
      .find((i) => i.module === 'weight')!
    expect(t.why.toLowerCase()).toContain('up about')
  })

  it('reads a recomp as holding steady', () => {
    // A neutral goal title so the body-comp direction falls to the profile (maintain).
    const t = buildGoalGuide(goal('recomp'), ['weight'], { weighIns: weighSeries(75, 0), weightDirection: 'maintain', units: 'metric' })
      .find((i) => i.module === 'weight')!
    expect(t.why.toLowerCase()).toMatch(/holding|recomp|steady/)
  })

  it('renders the weight rate in pounds for an imperial user', () => {
    const t = buildGoalGuide(goal('lose fat'), ['weight'], { weighIns: weighSeries(80, -0.3), weightDirection: 'lose', units: 'imperial' })
      .find((i) => i.module === 'weight')!
    expect(t.why).toContain('lb')
    expect(t.why).not.toMatch(/\bkg\b/)
  })

  it('keeps the canned line when there are no weigh-ins', () => {
    const withNone = weightRow([], 'lose')
    const plain = buildGoalGuide(goal('lose fat'), ['weight']).find((i) => i.module === 'weight')!
    expect(withNone.why).toBe(plain.why)
  })

  it('reads a real climb on a cut as "crept up", never the false "flat"', () => {
    const t = weightRow(weighSeries(80, 0.3), 'lose') // scale rising while trying to lose
    expect(t.why.toLowerCase()).toContain('crept up')
    expect(t.why.toLowerCase()).not.toContain('flat')
  })

  it('reads a real drop on a bulk as "slipped", never the false "flat"', () => {
    const t = buildGoalGuide(goal('lean bulk'), ['weight'], { weighIns: weighSeries(70, -0.3), weightDirection: 'gain', units: 'metric' })
      .find((i) => i.module === 'weight')!
    expect(t.why.toLowerCase()).toContain('slipped')
    expect(t.why.toLowerCase()).not.toContain('flat')
  })

  it('keeps the invariants on the weight copy', () => {
    for (const [series, dir] of [
      [weighSeries(80, -0.3), 'lose'],
      [weighSeries(80, 0), 'lose'],
      [weighSeries(70, 0.25), 'gain'],
      [weighSeries(75, 0), 'maintain'],
    ] as const) {
      const t = weightRow(series, dir)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the protein row', () => {
  const proteinRow = (perDayG: number[], targetG: number | null) =>
    buildGoalGuide(goal('lose fat'), ['macros'], { protein: { perDayG, targetG } })
      .find((i) => i.module === 'macros')!

  it('flags the low days against the protein target', () => {
    const t = proteinRow([120, 130, 110, 170], 180)
    expect(t.why.toLowerCase()).toContain('under your 180g target')
    expect(t.why.toLowerCase()).not.toContain('whole foods, not bars') // upgraded past canned
  })

  it('praises hitting the target almost every day', () => {
    const t = proteinRow([185, 190, 180, 182], 180)
    expect(t.why.toLowerCase()).toMatch(/every day|consistency/)
    expect(t.why).toContain('180g')
  })

  it('gives a daily-average line when there is no target set', () => {
    const t = proteinRow([140, 150, 130], null)
    expect(t.why.toLowerCase()).toContain('average about')
    expect(t.why).toContain('g')
  })

  it('does not claim "almost every day" from a single logged day', () => {
    const t = proteinRow([200], 180) // one day above target is not a frequency yet
    expect(t.why.toLowerCase()).not.toContain('almost every day')
    expect(t.why.toLowerCase()).toContain('average about')
  })

  it('keeps the canned line when no protein has been logged', () => {
    const withNone = proteinRow([], 180)
    const plain = buildGoalGuide(goal('lose fat'), ['macros']).find((i) => i.module === 'macros')!
    expect(withNone.why).toBe(plain.why)
  })

  it('keeps the invariants on the protein copy', () => {
    const cases: [number[], number | null][] = [
      [[120, 130, 110, 170], 180],
      [[185, 190, 180, 182], 180],
      [[140, 150, 130], null],
    ]
    for (const [days, target] of cases) {
      const t = proteinRow(days, target)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the brand row', () => {
  /** A follower series over distinct weeks at a fixed weekly growth. */
  function followerSeries(start: number, perWeek: number, points = 5) {
    return Array.from({ length: points }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 1 + i * 7)) // May 1, May 8, ...
      return { date: d.toISOString().slice(0, 10), count: start + i * perWeek }
    })
  }
  const brandRow = (
    social: GuideSignals['social'],
    title = 'grow my channel',
    targetDate: string | null = null,
    today = '2026-06-21',
  ) =>
    buildGoalGuide({ title, cleanTitle: null, category: null, targetDate }, ['brand'], { social, today })
      .find((i) => i.module === 'brand')!
  const plainBrand = (title = 'grow my channel') =>
    buildGoalGuide(goal(title), ['brand']).find((i) => i.module === 'brand')!

  it('reads the real follower pace and current count, beating the canned line', () => {
    const t = brandRow({ platform: 'youtube', series: followerSeries(2000, 100) }) // ends 2,400
    expect(t.why.toLowerCase()).toContain('subscribers') // youtube → subscribers
    expect(t.why.toLowerCase()).toContain('a week')
    expect(t.why).toContain('2,400') // grounded in the real latest count
    expect(t.why).not.toBe(plainBrand().why)
  })

  it('says followers (not subscribers) for a non-youtube platform', () => {
    const t = brandRow({ platform: 'instagram', series: followerSeries(2000, 100) })
    expect(t.why.toLowerCase()).toContain('followers')
    expect(t.why.toLowerCase()).not.toContain('subscribers')
  })

  it('projects to the follower target with an ETA against the goal date', () => {
    // 2,400 now growing 100/wk, goal 3,000 → ~6 weeks; goal date is ~6 weeks out → on it.
    const t = brandRow(
      { platform: 'instagram', series: followerSeries(2000, 100) },
      'reach 3,000 followers', '2026-08-02', '2026-06-21',
    )
    expect(t.why.toLowerCase()).toContain('to go')
    expect(t.why).toContain('3,000') // the goal count
    expect(t.why).toContain('August 2')
  })

  it('handles a "k" target (reach 10k subscribers)', () => {
    const t = brandRow({ platform: 'youtube', series: followerSeries(2000, 200) }, 'reach 10k subscribers')
    expect(t.why).toContain('10,000') // 10k expanded
    expect(t.why.toLowerCase()).toContain('to go')
  })

  it('never sums platforms — uses only the one passed primary series', () => {
    const t = brandRow({ platform: 'youtube', series: followerSeries(1000, 50) }) // ends 1,200
    expect(t.why).toContain('1,200') // the single series' current, never a cross-platform sum
  })

  it('keeps the canned line when there are fewer than 2 snapshots', () => {
    const withOne = brandRow({ platform: 'youtube', series: [{ date: '2026-06-01', count: 2000 }] })
    expect(withOne.why).toBe(plainBrand().why)
  })

  it('keeps the canned line when followers are flat (no real growth)', () => {
    const flat = brandRow({ platform: 'youtube', series: followerSeries(2000, 0) })
    expect(flat.why).toBe(plainBrand().why)
  })

  it('only touches the brand item — a strength goal is never affected by social signals', () => {
    const items = buildGoalGuide(goal('get stronger', 'fitness'), ['train'], { social: { platform: 'youtube', series: followerSeries(2000, 100) } })
    expect(items.every((i) => i.module !== 'brand')).toBe(true)
    const plain = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    expect(items.map((i) => i.why)).toEqual(plain.map((i) => i.why))
  })

  it('keeps the invariants on the brand copy (verbatim key, no em dash, filling)', () => {
    for (const [title, date] of [
      ['reach 3,000 followers', '2026-08-02'],
      ['reach 3,000 followers', null],
      ['grow my channel', null],
    ] as [string, string | null][]) {
      const t = brandRow({ platform: 'youtube', series: followerSeries(2000, 100) }, title, date)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the finance row', () => {
  /** A net-worth series (CHF) over distinct weeks at a fixed weekly gain. */
  function nwSeries(startChf: number, perWeekChf: number, points = 6) {
    return Array.from({ length: points }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 1 + i * 7)) // May 1, May 8, ...
      return { date: d.toISOString().slice(0, 10), valueChf: startChf + i * perWeekChf }
    })
  }
  const financeRow = (
    finance: GuideSignals['finance'],
    title = 'build my net worth',
    targetDate: string | null = null,
    today = '2026-06-21',
  ) =>
    buildGoalGuide({ title, cleanTitle: null, category: null, targetDate }, ['finance'], { finance, today })
      .find((i) => i.module === 'finance')!
  const plainFinance = (title = 'build my net worth') =>
    buildGoalGuide(goal(title), ['finance']).find((i) => i.module === 'finance')!

  it('reads the real monthly net-worth pace and current value, beating the canned line', () => {
    const t = financeRow({ currency: 'CHF', series: nwSeries(122000, 575) }) // ~2.5k/mo
    expect(t.why.toLowerCase()).toContain('net worth')
    expect(t.why.toLowerCase()).toContain('a month') // per-MONTH cadence for money
    expect(t.why).toContain('CHF')
    expect(t.why).not.toBe(plainFinance().why)
  })

  it('projects to a money target with an ETA against the goal date', () => {
    // 127.3k now, +2k/mo (~460/wk), goal 150k → ~12 months; goal date ~12.5 months out → before.
    const t = financeRow(
      { currency: 'CHF', series: nwSeries(125000, 460) },
      'reach 150k net worth', '2027-07-01', '2026-06-21',
    )
    expect(t.why.toLowerCase()).toContain('to go')
    expect(t.why).toContain('150k') // the goal value
    expect(t.why).toContain('July 1')
  })

  it('expands a k target and shows the gap in CHF', () => {
    const t = financeRow({ currency: 'CHF', series: nwSeries(100000, 500) }, 'save 200k')
    expect(t.why).toContain('200k')
    expect(t.why.toLowerCase()).toContain('to go')
  })

  it('never projects net worth toward an MRR / revenue / ARR target (not the same money)', () => {
    // '10k mrr' is a business-income goal; the user's net-worth series must not
    // be projected toward it. The canned finance line (the module link) stays.
    for (const title of ['10k mrr', 'hit 5k monthly revenue', 'get to 120k ARR']) {
      const t = financeRow({ currency: 'CHF', series: nwSeries(122000, 575) }, title)
      expect(t).toBeDefined() // the finance module link is kept
      expect(t.why).toBe(plainFinance(title).why) // ...but no net-worth projection
      expect(t.why).not.toContain('to go')
    }
  })

  it('stays in CHF and does not personalize for a non-CHF currency (no FX here)', () => {
    const usd = financeRow({ currency: 'USD', series: nwSeries(122000, 575) })
    expect(usd.why).toBe(plainFinance().why) // canned line stays
  })

  it('keeps the canned line when there are fewer than 2 history points', () => {
    const one = financeRow({ currency: 'CHF', series: [{ date: '2026-06-01', valueChf: 100000 }] })
    expect(one.why).toBe(plainFinance().why)
  })

  it('keeps the canned line when net worth is flat (no real growth)', () => {
    const flat = financeRow({ currency: 'CHF', series: nwSeries(100000, 0) })
    expect(flat.why).toBe(plainFinance().why)
  })

  it('only touches the finance item — a strength goal is never affected by finance signals', () => {
    const items = buildGoalGuide(goal('get stronger', 'fitness'), ['train'], { finance: { currency: 'CHF', series: nwSeries(122000, 575) } })
    expect(items.every((i) => i.module !== 'finance')).toBe(true)
    const plain = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    expect(items.map((i) => i.why)).toEqual(plain.map((i) => i.why))
  })

  it('keeps the invariants on the finance copy (verbatim key, no em dash, filling)', () => {
    for (const [title, date] of [
      ['reach 150k net worth', '2027-07-01'],
      ['reach 150k net worth', null],
      ['build my net worth', null],
    ] as [string, string | null][]) {
      const t = financeRow({ currency: 'CHF', series: nwSeries(125000, 460) }, title, date)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the recovery row', () => {
  /** N consecutive nights of sleep hours + optional recovery scores. */
  function nights(sleepHs: number[], recoveries: (number | null)[] = []) {
    return sleepHs.map((h, i) => {
      const d = new Date(Date.UTC(2026, 4, 1 + i))
      return { date: d.toISOString().slice(0, 10), sleepH: h, recovery: recoveries[i] ?? null }
    })
  }
  const recoveryRow = (recovery: GuideSignals['recovery'], title = 'fix my sleep') =>
    buildGoalGuide(goal(title), ['recovery'], { recovery }).find((i) => i.module === 'recovery')!
  const plainRecovery = (title = 'fix my sleep') =>
    buildGoalGuide(goal(title), ['recovery']).find((i) => i.module === 'recovery')!

  it('states the real sleep average over >=7 nights, beating the canned line', () => {
    const t = recoveryRow({ nights: nights([7.2, 7.0, 7.4, 7.1, 7.3, 7.2, 7.5]) })
    expect(t.why.toLowerCase()).toContain('h of sleep')
    expect(t.why).toMatch(/7\.\d h/) // a labelled hour figure
    expect(t.why).not.toBe(plainRecovery().why)
  })

  it('adds a recovery trend clause when the recovery score is climbing', () => {
    const t = recoveryRow({ nights: nights([7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5], [40, 45, 50, 55, 60, 65, 70]) })
    expect(t.why.toLowerCase()).toContain('trending up')
  })

  it('gently nudges when average sleep is low, never shaming', () => {
    const t = recoveryRow({ nights: nights([5.5, 6.0, 6.1, 5.8, 6.2, 6.0, 5.9]) })
    expect(t.why.toLowerCase()).toContain('30 minutes')
    expect(t.why.toLowerCase()).not.toContain('not sleeping')
  })

  it('does not contradict itself: an average that rounds to 7 h never says "add 30 minutes"', () => {
    // avg 6.95 used to print "7 h" then nag "add 30 minutes" — a self-contradiction.
    const t = recoveryRow({ nights: nights([6.95, 6.95, 6.95, 6.95, 6.95, 6.95, 6.95]) })
    expect(t.why).toContain('7 h')
    expect(t.why.toLowerCase()).not.toContain('30 minutes')
  })

  it('omits the trend clause when there is no recovery score (sleep-only band)', () => {
    const t = recoveryRow({ nights: nights([7.5, 7.6, 7.4, 7.5, 7.5, 7.6, 7.4]) })
    expect(t.why.toLowerCase()).toContain('h of sleep')
    expect(t.why.toLowerCase()).not.toContain('trending')
    expect(t.why.toLowerCase()).not.toContain('dipped')
  })

  it('never prints a raw recovery score number (providers are not comparable)', () => {
    const t = recoveryRow({ nights: nights([7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5], [40, 45, 50, 55, 60, 65, 70]) })
    expect(t.why).not.toMatch(/recovery is \d/) // direction only, never "recovery is 70"
  })

  it('keeps the canned line when there are fewer than 7 nights', () => {
    const t = recoveryRow({ nights: nights([7.2, 7.0, 7.4, 7.1, 7.3]) }) // 5 nights
    expect(t.why).toBe(plainRecovery().why)
  })

  it('keeps the invariants on the recovery copy (verbatim key, no em dash, filling)', () => {
    for (const rec of [[40, 45, 50, 55, 60, 65, 70], [70, 65, 60, 55, 50, 45, 40], [] as number[]]) {
      const t = recoveryRow({ nights: nights([7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5], rec) })
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the supplements row', () => {
  const suppTitle = 'take my supplements every day'
  const suppRow = (supplements: GuideSignals['supplements']) =>
    buildGoalGuide(goal(suppTitle), ['supplements'], { supplements }).find((i) => i.module === 'supplements')!
  const plainSupp = () => buildGoalGuide(goal(suppTitle), ['supplements']).find((i) => i.module === 'supplements')!

  it('routes a supplement goal to the supplements row', () => {
    const items = buildGoalGuide(goal(suppTitle), [])
    expect(items[0].module).toBe('supplements')
  })

  it('praises strong adherence with the real X of N count', () => {
    const t = suppRow({ daysDefined: 7, daysHit: 6, stackSize: 4 })
    expect(t.why).toContain('6 of the last 7 days')
    expect(t.why).not.toBe(plainSupp().why)
  })

  it('flags the missed days on partial adherence, warmly', () => {
    const t = suppRow({ daysDefined: 7, daysHit: 4, stackSize: 4 })
    expect(t.why).toContain('4 of 7 days')
    expect(t.why.toLowerCase()).toContain('3 missed')
    expect(t.why.toLowerCase()).not.toContain('fail')
  })

  it('calls a perfect run when every defined day was hit', () => {
    const t = suppRow({ daysDefined: 5, daysHit: 5, stackSize: 3 })
    expect(t.why.toLowerCase()).toContain('every day it has been set up')
  })

  it('nudges to start when the stack is set but nothing ticked', () => {
    const t = suppRow({ daysDefined: 4, daysHit: 0, stackSize: 5 })
    expect(t.why.toLowerCase()).toContain('not ticked it off')
    expect(t.why).toContain('5') // names the stack size
  })

  it('keeps the canned line for an empty stack (never reports 0 of 0 as success)', () => {
    expect(suppRow({ daysDefined: 0, daysHit: 0, stackSize: 0 }).why).toBe(plainSupp().why)
  })

  it('keeps the canned line when the stack has no gradeable run yet', () => {
    expect(suppRow({ daysDefined: 0, daysHit: 0, stackSize: 4 }).why).toBe(plainSupp().why)
  })

  it('keeps the invariants on the supplements copy', () => {
    for (const s of [
      { daysDefined: 7, daysHit: 6, stackSize: 4 },
      { daysDefined: 7, daysHit: 4, stackSize: 4 },
      { daysDefined: 5, daysHit: 5, stackSize: 3 },
      { daysDefined: 4, daysHit: 0, stackSize: 5 },
      { daysDefined: 1, daysHit: 1, stackSize: 3 },
      { daysDefined: 1, daysHit: 0, stackSize: 3 },
    ]) {
      const t = suppRow(s)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('buildGoalGuide — the brain personalizes the water row', () => {
  const waterRow = (water: GuideSignals['water'], title = 'drink more water') =>
    buildGoalGuide(goal(title), ['water'], { water }).find((i) => i.module === 'water')!
  const plainWater = (title = 'drink more water') =>
    buildGoalGuide(goal(title), ['water']).find((i) => i.module === 'water')!

  it('reads the real average against the personalized target, in the user unit', () => {
    const t = waterRow({ todayServings: 4, recentAvgServings: 8.3, targetServings: 11, unit: 'bottle' })
    expect(t.why).toContain('8.3 of your 11 bottles') // real avg vs real computed target
    expect(t.why).not.toBe(plainWater().why)
  })

  it('uses the user unit (glasses), never a generic "8 glasses"', () => {
    const t = waterRow({ todayServings: 2, recentAvgServings: 6, targetServings: 9, unit: 'glass' })
    expect(t.why).toContain('6 of your 9 glasses')
    expect(t.why.toLowerCase()).toContain('3-glass gap')
  })

  it('praises hitting the target when the average meets or beats it', () => {
    const t = waterRow({ todayServings: 9, recentAvgServings: 11.2, targetServings: 11, unit: 'bottle' })
    expect(t.why.toLowerCase()).toContain('almost every day')
  })

  it('does not contradict itself: an average that rounds up to the target praises, never "close the gap"', () => {
    // avg 7.96 used to print "8 of your 8 glasses" then "close that 1-glass gap".
    const t = waterRow({ todayServings: 6, recentAvgServings: 7.96, targetServings: 8, unit: 'glass' })
    expect(t.why.toLowerCase()).toContain('almost every day')
    expect(t.why.toLowerCase()).not.toContain('gap')
  })

  it('speaks only to today when there is no multi-day history yet', () => {
    const t = waterRow({ todayServings: 2, recentAvgServings: null, targetServings: 10, unit: 'bottle' })
    expect(t.why.toLowerCase()).toContain('so far today')
    expect(t.why).toContain('2 of your 10 bottles')
  })

  it('keeps the canned line when there is no logged history at all', () => {
    const t = waterRow({ todayServings: 0, recentAvgServings: null, targetServings: 10, unit: 'bottle' })
    expect(t.why).toBe(plainWater().why)
  })

  it('keeps the invariants on the water copy', () => {
    for (const w of [
      { todayServings: 4, recentAvgServings: 8.3, targetServings: 11, unit: 'bottle' },
      { todayServings: 2, recentAvgServings: 6, targetServings: 9, unit: 'glass' },
      { todayServings: 9, recentAvgServings: 11.2, targetServings: 11, unit: 'bottle' },
      { todayServings: 2, recentAvgServings: null, targetServings: 10, unit: 'oz' },
    ]) {
      const t = waterRow(w)
      expect(t.why).toContain(t.key)
      expect(t.why).not.toContain('—')
      expect(t.why.length).toBeGreaterThan(40)
    }
  })
})

describe('supplementAdherence — the floored, timezone-safe stack-adherence math', () => {
  /** Trailing 7 day-keys, most-recent first, ending at `today`. */
  function window7(today: string): string[] {
    const base = Date.parse(`${today}T00:00:00Z`)
    return Array.from({ length: 7 }, (_, i) => new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  }

  it('grades a brand-new first-ever tick as a perfect 1/1, never a phantom miss (6am boundary)', () => {
    // Pre-6am: the module files the tick under YESTERDAY (06-20); the gather's today is 06-21.
    const r = supplementAdherence({ items: [{ id: 'a' }], taken: { '2026-06-20': { a: 1 } } }, window7('2026-06-21'), '2026-06-21')
    expect(r).toEqual({ daysDefined: 1, daysHit: 1, stackSize: 1 })
  })

  it('never grades today as a miss before it is over (unticked today is excluded)', () => {
    // Stack ticked yesterday, not yet today. Today must NOT count as a missed day.
    const r = supplementAdherence({ items: [{ id: 'a' }], taken: { '2026-06-20': { a: 1 } } }, window7('2026-06-21'), '2026-06-21')
    expect(r!.daysDefined).toBe(1) // only 06-20, today (06-21) excluded
  })

  it('floors the window at the first day a CURRENT item was ticked (ignores deleted-item history)', () => {
    // 'a' ticked for 3 past days then removed; current stack is just 'b', ticked only today.
    const r = supplementAdherence(
      { items: [{ id: 'b' }], taken: { '2026-06-18': { a: 1 }, '2026-06-19': { a: 1 }, '2026-06-20': { a: 1 }, '2026-06-21': { b: 1 } } },
      window7('2026-06-21'), '2026-06-21',
    )
    expect(r).toEqual({ daysDefined: 1, daysHit: 1, stackSize: 1 }) // never "1 of 4"
  })

  it('counts real past misses honestly', () => {
    const r = supplementAdherence(
      { items: [{ id: 'a' }], taken: { '2026-06-19': { a: 1 }, '2026-06-21': { a: 1 } } },
      window7('2026-06-21'), '2026-06-21',
    )
    // stackStart 06-19; counted = 06-19(hit), 06-20(miss), 06-21(today hit) => 2 of 3
    expect(r).toEqual({ daysDefined: 3, daysHit: 2, stackSize: 1 })
  })

  it('returns null for an empty stack, no blob, or no current-item ticks', () => {
    expect(supplementAdherence({ items: [], taken: { '2026-06-20': { a: 1 } } }, window7('2026-06-21'), '2026-06-21')).toBeNull()
    expect(supplementAdherence(null, window7('2026-06-21'), '2026-06-21')).toBeNull()
    expect(supplementAdherence({ items: [{ id: 'b' }], taken: { '2026-06-20': { a: 1 } } }, window7('2026-06-21'), '2026-06-21')).toBeNull()
  })
})

describe('guideProjectionLead — lifts the grounded projection lead for the §01 headline + honestRead', () => {
  const lifts = () => [
    climbing('bench_bb', 'Bench Press', 80, 2.5),
    climbing('tri_pushdown', 'Tricep Pushdown', 30, 1),
    climbing('standing_ohp', 'Overhead Press', 45, 1),
  ]

  it('returns the first sentence of a fired train projection, not the advice tail', () => {
    const items = buildGoalGuide(
      { title: '225-Pound Bench Press For 5', cleanTitle: null, category: 'fitness', targetDate: '2026-09-01' },
      ['train'], { lifts: lifts(), today: '2026-06-21' },
    )
    const lead = guideProjectionLead(items, 'train')
    expect(lead).toBeTruthy()
    expect(lead).toContain('Bench Press')
    expect(lead!.endsWith('.')).toBe(true)
    expect(lead).not.toContain(' so ') // only the lead clause, never the "so {advice}" tail
    expect(lead).not.toContain('—')
  })

  it('returns null when the train row stayed canned (no lift signals fired)', () => {
    const items = buildGoalGuide(goal('get stronger', 'fitness'), ['train'])
    expect(guideProjectionLead(items, 'train')).toBeNull()
  })

  it('never lifts a STALL read onto an on-track celebratory line', () => {
    // A stalled bench: liftBrain returns "...has not moved...". The dropdown shows
    // it honestly, but it must NOT be lifted onto an on-track headline/honestRead.
    const items = buildGoalGuide(goal('bench 225 for 5', 'fitness'), ['train'], { lifts: [stalledLift('bench', 'Bench Press')] })
    expect(items.find((i) => i.module === 'train')!.why.toLowerCase()).toContain('has not moved')
    expect(guideProjectionLead(items, 'train')).toBeNull()
  })

  it('never lifts a "cut has stalled" / flat weight read onto an on-track line', () => {
    const items = buildGoalGuide(goal('lose fat'), ['weight'], { weighIns: [
      { date: '2026-05-01', kg: 80 }, { date: '2026-05-08', kg: 80 }, { date: '2026-05-15', kg: 80 },
    ], weightDirection: 'lose', units: 'metric' })
    expect(items.find((i) => i.module === 'weight')!.why.toLowerCase()).toContain('stall')
    expect(guideProjectionLead(items, 'weight')).toBeNull()
  })

  it('returns null when the requested module is absent from the guide', () => {
    const items = buildGoalGuide(goal('reach 1000 subscribers'), [])
    expect(guideProjectionLead(items, 'train')).toBeNull()
  })

  it('returns null for undefined items', () => {
    expect(guideProjectionLead(undefined, 'weight')).toBeNull()
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * TRAIN 4 + the break-hunt scenarios (2026-07-10 verified breaks, now laws).
 * ──────────────────────────────────────────────────────────────────────────── */

import { MODULE_FEED_ME, SCALE_MUTE_RE, strongestBinding, isInjuryGoal, type GuideModule } from '@/lib/insights/goalGuide'

describe('KILLER CLASS: the scale is muted for non-body health goals', () => {
  it('therapy / posture / mental health never get the weigh-in lever', () => {
    for (const t of ['therapy every week', 'fix my posture', 'improve my mental health', 'meditate daily', 'see a counselor', 'manage my anxiety']) {
      const items = buildGoalGuide(goal(t, 'health'), [])
      const mods = items.map(i => i.module)
      expect(mods).not.toContain('weight')
      for (const i of items) expect(i.why).not.toContain('Weigh in daily')
      // ...and they are never leverless either: the notes lever steps in
      // (unless a real theme matched, e.g. meditation is fine to theme).
      expect(items.length).toBeGreaterThan(0)
    }
  })

  it('SCALE_MUTE_RE matches the whole family on lowercased titles', () => {
    for (const t of ['therapy', 'therapist visits', 'mental health', 'posture', 'meditate', 'meditation', 'mindfulness', 'counseling', 'anxiety', 'depression']) {
      expect(SCALE_MUTE_RE.test(t)).toBe(true)
    }
    for (const t of ['lose fat', 'quit sugar', 'feel better day to day']) {
      expect(SCALE_MUTE_RE.test(t)).toBe(false)
    }
  })

  it('a genuinely body-comp health goal keeps the scale', () => {
    expect(buildGoalGuide(goal('get healthier and lose weight', 'health'), [])[0].module).toBe('weight')
    expect(buildGoalGuide(goal('feel better day to day', 'health'), []).map(i => i.module)).toEqual(['weight', 'macros'])
  })

  it('behavioral habits an AI triage files under health never get the weigh-in lever (2026-07-10 hunt)', () => {
    for (const t of ['stop biting my nails', 'stop doomscrolling', 'less screen time', 'be happier', 'journal every day']) {
      expect(SCALE_MUTE_RE.test(t)).toBe(true)
      expect(buildGoalGuide(goal(t, 'health'), []).map(i => i.module)).toEqual(['notes'])
    }
  })

  it('a scale-muted title never earns the wordless fitness category trigger either', () => {
    // Haiku can read posture as fitness (body composition); with no body word
    // and the scale mute in force, the honest lever stays notes, so the panel
    // paragraph and the lightbulb can never disagree.
    expect(buildGoalGuide(goal('fix my posture', 'fitness'), []).map(i => i.module)).toEqual(['notes'])
    expect(buildGoalGuide(goal('meditate daily', 'fitness'), []).map(i => i.module)).toEqual(['notes'])
  })
})

describe('null-category goals: loose words stay gated (guessCategory stands in)', () => {
  it("'save my relationship with my son' never earns the net-worth bulb", () => {
    const items = buildGoalGuide(goal('save my relationship with my son', null), [])
    expect(items.map(i => i.module)).not.toContain('finance')
    expect(items.map(i => i.module)).toEqual(['notes'])
  })

  it("'squat without pain' takes the gentle injury route even uncategorized", () => {
    const items = buildGoalGuide(goal('squat without pain', null), [])
    expect(items.map(i => i.module)).toEqual(['recovery'])
    expect(items[0].why).toContain('let recovery lead')
  })

  it("'no more energy drinks' never earns the recovery lever from the loose word 'energy'", () => {
    const mods = buildGoalGuide(goal('no more energy drinks', null), []).map(i => i.module)
    expect(mods).not.toContain('recovery')
  })

  it("'save 10k' still earns finance uncategorized (guessCategory reads money)", () => {
    expect(buildGoalGuide(goal('save 10k', null), [])[0].module).toBe('finance')
  })
})

describe('injury route beyond strict fitness', () => {
  it("'rehab my knee' reaches the gentle route from fitness, health, general and null", () => {
    for (const cat of ['fitness', 'health', 'general', null]) {
      const items = buildGoalGuide(goal('rehab my knee', cat), [])
      expect(items.map(i => i.module)).toEqual(['recovery'])
      expect(items[0].why).toContain('let recovery lead')
    }
  })

  it("'recover from shoulder surgery' gets the gentle copy, not the weigh-in", () => {
    const items = buildGoalGuide(goal('recover from shoulder surgery', 'health'), [])
    expect(items.map(i => i.module)).toEqual(['recovery'])
    expect(items[0].why).toContain('let recovery lead')
  })

  it('isInjuryGoal stays out of non-body categories', () => {
    expect(isInjuryGoal('save 10k even if it is a pain', 'money')).toBe(false)
    expect(isInjuryGoal('the pain of studying', 'mind')).toBe(false)
    expect(isInjuryGoal('rehab my knee', null)).toBe(true)
  })
})

describe('cardio goals get cardio copy, never barbell copy', () => {
  it("'run a marathon' and 'run 5k' never say 'one rep or a little weight'", () => {
    for (const t of ['run a marathon', 'run 5k', 'jog every morning']) {
      const items = buildGoalGuide(goal(t, 'fitness'), [])
      expect(items[0].module).toBe('train')
      expect(items[0].label).toBe('Log your cardio')
      expect(items[0].why).toContain('distance or pace')
      expect(items[0].why).not.toContain('rep')
    }
  })

  it('the cardio copy is CANNED for guideGroundedWhy (never mistaken for a data read)', () => {
    const items = buildGoalGuide(goal('run a marathon', 'fitness'), [])
    expect(guideGroundedWhy(items, 'train')).toBeNull()
  })

  it('a barbell goal keeps the barbell copy', () => {
    const items = buildGoalGuide(goal('bench 100kg', 'fitness'), [])
    expect(items[0].label).toBe('Log your lifts')
    expect(items[0].why).toContain('Beat last time')
  })
})

describe('long-rant guard: a strong word cannot hijack a long multi-domain title', () => {
  const rant =
    'i feel like i never see my friends anymore and my bank account is empty and i want to make money and get healthy but mostly i just want my people back in my life this year'

  it('a people-categorized rant with a money word never earns the net-worth bulb', () => {
    expect(rant.length).toBeGreaterThan(120)
    const items = buildGoalGuide(goal(rant, 'people'), [])
    expect(items.map(i => i.module)).not.toContain('finance')
    expect(items.map(i => i.module)).toEqual(['notes'])
  })

  it('a GENERAL-categorized rant takes the notes floor, never rule-order roulette', () => {
    // With no agreeing category, the first strong word in rule order (money)
    // must not pick the lever for a 150+ char multi-domain sentence.
    const items = buildGoalGuide(goal(rant, 'general'), [])
    expect(items.map(i => i.module)).toEqual(['notes'])
  })

  it('a SHORT title with a strong word still wins for any category', () => {
    expect(buildGoalGuide(goal('grow my net worth', 'career'), [])[0].module).toBe('finance')
  })

  it('a long title whose category AGREES keeps its theme', () => {
    const moneyRant =
      'this is the year i finally sort out my money situation for real: pay everything off, build real savings month after month, and stop feeling broke every single january like clockwork'
    expect(moneyRant.length).toBeGreaterThan(120)
    expect(buildGoalGuide(goal(moneyRant, 'money'), [])[0].module).toBe('finance')
  })
})

describe('parseTargetCount year guard (via brandBrain)', () => {
  const growingSocial = {
    platform: 'youtube',
    series: Array.from({ length: 6 }, (_, i) => ({ date: `2026-06-${String(i * 5 + 1).padStart(2, '0')}`, count: 500 + i * 40 })),
  }

  it("'In 2026 I want 1000 subscribers' projects toward 1,000, never 2,026", () => {
    const items = buildGoalGuide(goal('In 2026 I want 1000 subscribers', 'audience'), ['brand'], { social: growingSocial, today: '2026-07-01' })
    const why = items.find(i => i.module === 'brand')!.why
    expect(why).toContain('1,000')
    expect(why).not.toContain('2,026')
  })

  it("'By 2026 hit 10k subscribers' reads the 10k, not the year", () => {
    // a faster-growing series so the 10k horizon stays inside project()'s cap
    const fast = {
      platform: 'youtube',
      series: Array.from({ length: 6 }, (_, i) => ({ date: `2026-06-${String(i * 5 + 1).padStart(2, '0')}`, count: 500 + i * 100 })),
    }
    const items = buildGoalGuide(goal('By 2026 hit 10k subscribers', 'audience'), ['brand'], { social: fast, today: '2026-07-01' })
    const why = items.find(i => i.module === 'brand')!.why
    expect(why).toContain('10,000')
    expect(why).not.toContain('2,026')
  })
})

describe('EVERY GOAL HAS A LIGHTBULB (TRAIN 4 coverage matrix)', () => {
  const MATRIX: Array<[string, string | null]> = [
    // category x adversarial sample titles from the hunt
    ['therapy every week', 'health'],
    ['fix my posture', 'health'],
    ['improve my mental health', 'health'],
    ['stop vaping', 'health'],
    ['sleep 8 hours every night', 'health'],
    ['lose 10 pounds', 'general'],
    ['lose 10 pounds', null],
    ['walk 10k steps', null],
    ['rehab my knee', 'general'],
    ['run a marathon', 'fitness'],
    ['bench 225', 'fitness'],
    ['save my relationship with my son', 'people'],
    ['call my mom every sunday', 'people'],
    ['be a better dad', 'people'],
    ['get promoted', 'career'],
    ['level up my career', 'career'],
    ['write a novel', 'craft'],
    ['learn spanish', 'mind'],
    ['be more productive', 'mind'],
    ['meditate', 'mind'],
    ['save 10k', 'money'],
    ['reach 1000 subscribers', 'audience'],
    ['be happier', 'general'],
    ['i need a better workflow', null],
    ['grow as a person', 'general'],
  ]

  it('every category x sample title yields at least one lever with a real route', () => {
    for (const [title, cat] of MATRIX) {
      const items = buildGoalGuide(goal(title, cat), [])
      expect(items.length).toBeGreaterThan(0)
      for (const i of items) {
        expect(i.href.startsWith('/app/')).toBe(true)
        expect(i.why.length).toBeGreaterThan(0)
        expect(i.key.length).toBeGreaterThan(0)
        expect(i.why.toLowerCase()).toContain(i.key.toLowerCase())
      }
    }
  })

  it('MODULE_FEED_ME covers every module with an honest ask', () => {
    const modules: GuideModule[] = ['train', 'weight', 'macros', 'water', 'recovery', 'supplements', 'brand', 'finance', 'notes']
    for (const m of modules) {
      expect(typeof MODULE_FEED_ME[m]).toBe('string')
      expect(MODULE_FEED_ME[m].length).toBeGreaterThan(10)
      expect(MODULE_FEED_ME[m]).not.toContain('—') // no em dashes, ever
    }
  })
})

describe('strongestBinding (TRAIN 4): the named metric for the empty graph slot', () => {
  it('names the guide-top module when the user logs nothing yet', () => {
    const b = strongestBinding(goal('lose 10 pounds', 'health'), [])
    expect(b.module).toBe('weight')
    expect(b.metric).toBe('weight')
    expect(b.feedLine).toContain('start logging your weight')
    expect(b.active).toBe(false)
  })

  it('prefers a module the user already feeds', () => {
    const b = strongestBinding(goal('get lean and strong', 'fitness'), ['macros'])
    expect(b.module).toBe('macros')
    expect(b.active).toBe(true)
  })

  it('never returns bindingless: the notes floor holds for any string', () => {
    for (const [title, cat] of [['be happier', 'general'], ['asdf goal words', null], ['level up my career', 'career']] as Array<[string, string | null]>) {
      const b = strongestBinding(goal(title, cat), [])
      expect(b.module).toBeTruthy()
      expect(b.feedLine.length).toBeGreaterThan(0)
      expect(b.href.startsWith('/app/')).toBe(true)
    }
  })

  it('the notes binding speaks its own line', () => {
    const b = strongestBinding(goal('be happier', 'general'), [])
    expect(b.module).toBe('notes')
    expect(b.feedLine).toContain('write a note each day')
  })
})

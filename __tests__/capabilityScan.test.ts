import { scanCapability } from '@/lib/tiles/capabilityScan'

/**
 * The honesty gate (POWERED-TILES-PLAN decision 4): clear external asks hand
 * off to Claude Code; everything trackable-by-taps stays buildable. The scan
 * is CONSERVATIVE - a false handoff is worse than a manual tracker.
 */
describe('scanCapability: hands off what the free engine truly cannot build', () => {
  test('platform asks hand off with their provider', () => {
    expect(scanCapability('track my youtube subscribers')).toMatchObject({
      verdict: 'handoff',
      provider: 'youtube',
    })
    expect(scanCapability('my subs this month')).toMatchObject({ verdict: 'handoff', provider: 'youtube' })
    expect(scanCapability('instagram followers')).toMatchObject({ verdict: 'handoff', provider: 'instagram' })
    expect(scanCapability('a shopify sales tile')).toMatchObject({ verdict: 'handoff', provider: 'shopify' })
    expect(scanCapability('stripe mrr')).toMatchObject({ verdict: 'handoff', provider: 'stripe' })
  })

  test('AI asks hand off without a provider', () => {
    expect(scanCapability('an ai coach that talks to me')).toMatchObject({ verdict: 'handoff' })
    expect(scanCapability('a chatbot for my day')).toMatchObject({ verdict: 'handoff' })
    expect(scanCapability('an ai coach').provider).toBeUndefined()
  })

  test('live outside data hands off', () => {
    expect(scanCapability('the bitcoin price')).toMatchObject({ verdict: 'handoff' })
    expect(scanCapability('todays weather')).toMatchObject({ verdict: 'handoff' })
    expect(scanCapability('automatically track my sleep from my phone')).toMatchObject({ verdict: 'handoff' })
  })

  test('the seven tracker verbs stay buildable', () => {
    for (const ask of [
      '8 glasses of water',
      'my gym streak',
      '90 minutes of deep work',
      'mood out of 10',
      'bodyweight in lb',
      'daily spend',
      'did I read today',
      '20 pages of reading',
      'money I save each week',
    ]) {
      expect(scanCapability(ask).verdict).toBe('buildable')
    }
  })

  test('food context disarms the subs/streams platform words', () => {
    expect(scanCapability('how many subs I eat a week').verdict).toBe('buildable')
    expect(scanCapability('track the sandwiches and subs I ate').verdict).toBe('buildable')
  })

  test('empty input is buildable (the nudge handles it upstream)', () => {
    expect(scanCapability('   ').verdict).toBe('buildable')
  })
})

/**
 * The long-tail net (POWERED-TILES-PLAN D1 follow-up): the gate matches the SHAPE
 * of a live-data ask, not just the 8 named connectors, so an off-list platform,
 * social metric, live price, or wearable can never build a manual fake. Still
 * conservative: none of these may falsely refuse a real manual tracker.
 */
describe('scanCapability: the long-tail net', () => {
  test('off-list platforms hand off (no first-party provider)', () => {
    for (const ask of [
      'my linkedin connections',
      'my reddit karma',
      'my github stars',
      'my patreon patrons',
      'my discord server members',
      'total likes on my last post',
      'my facebook page',
      'orders on my etsy shop',
    ]) {
      expect(scanCapability(ask).verdict).toBe('handoff')
    }
  })

  test('live prices, indices and balances hand off', () => {
    for (const ask of [
      'live gas prices',
      'flight prices to tokyo',
      'todays s&p 500',
      'the price of oil',
      'my bank balance',
    ]) {
      expect(scanCapability(ask).verdict).toBe('handoff')
    }
  })

  test('naming a wearable/health app hands off (cannot sync from a sealed tile)', () => {
    for (const ask of ['my apple watch heart rate', 'sync my oura ring sleep', 'steps from my fitbit', 'my whoop recovery']) {
      expect(scanCapability(ask).verdict).toBe('handoff')
    }
  })

  test('rich-app asks that match a Vitality module point at the module', () => {
    const cases: Array<[string, string]> = [
      ['workout logger', 'train'],
      ['make me a workout logger', 'train'],
      ['a gym log', 'train'],
      ['meal journal', 'fuel'],
      ['food diary', 'fuel'],
      ['track my macros', 'fuel'],
      ['water logger', 'water'],
      ['weight logger', 'weight'],
      ['a journal for my thoughts', 'mentor'],
      ['my diary', 'mentor'],
    ]
    for (const [ask, module] of cases) {
      expect(scanCapability(ask)).toMatchObject({ verdict: 'module', module })
    }
  })

  test('rich-app asks with no module hand off to Claude', () => {
    for (const ask of ['sleep logger', 'a habit planner', 'an app for my chores']) {
      expect(scanCapability(ask).verdict).toBe('handoff')
    }
  })

  test('verb-shaped logs stay buildable (log/journal as an action, not an app)', () => {
    for (const ask of ['log my weight', 'log my meals', 'did i journal today', 'how many workouts this week']) {
      expect(scanCapability(ask).verdict).toBe('buildable')
    }
  })

  test('near-miss words never falsely refuse a real manual tracker', () => {
    for (const ask of [
      'how much i like my job 1-10', // "like" is not "likes"
      'gym members i greet', // "members" alone is not discord
      'the price i paid for lunch', // "price" is not "price of" / a live quote
      'gold stars on my chore chart', // "stars" alone is not github
      'threads i sew', // sewing, not Meta Threads
      'my mood after discord calls', // the emotion/context, not a discord metric
      'how many times i snap at people', // "snap" is not snapchat
      'flights i take this year', // "flights" is not "flight prices"
      'resting heart rate', // no device named -> a manual measure
    ]) {
      expect(scanCapability(ask).verdict).toBe('buildable')
    }
  })
})

import { buildFirstFind, type FirstFindInput } from '@/lib/insights/firstFind'
import { buildFeed } from '@/lib/insights/feed'
import { rarityForNotice } from '@/lib/vee/rarity'

const EMPTY: FirstFindInput = {
  sessions7: 0,
  weighIns: [],
  mealDays7: 0,
  proteinTodayG: null,
  waterTodayMl: 0,
  sleepLastH: null,
  recoveryLast: null,
  streams: [],
  units: 'metric',
}

const STARTER = { kind: 'watching' as const, headline: 'I am watching', body: 'across your logs. nothing yet.', goalTitle: null, watching: [] }

describe('buildFirstFind — the day-one honest observation', () => {
  it('returns null when the user has logged nothing at all (the cold card keeps that job)', () => {
    expect(buildFirstFind(EMPTY)).toBeNull()
  })

  it('finds a first weigh-in with the real number and date in the receipts', () => {
    const f = buildFirstFind({ ...EMPTY, weighIns: [{ date: '2026-07-10', kg: 82.4 }] })!
    expect(f.domain).toBe('weight')
    expect(f.lead).toContain('82.4 kg')
    expect(f.lead).toContain('first weigh-in')
    expect(f.receipts).toEqual(['82.4 kg · 2026-07-10'])
    expect(f.lever).toBe('on the record')
    expect(f.lead).toContain(f.lever!)
    expect(f.action!.href).toBe('/app/fitness/progress')
  })

  it('respects imperial units on the weigh-in (lb, one decimal, never raw kg)', () => {
    const f = buildFirstFind({ ...EMPTY, units: 'imperial', weighIns: [{ date: '2026-07-10', kg: 82.4 }] })!
    expect(f.lead).toContain('181.7 lb')
    expect(f.lead).not.toContain('82.4')
  })

  it('speaks plural honestly when more than one weigh-in exists but no trend fired', () => {
    const f = buildFirstFind({
      ...EMPTY,
      weighIns: [{ date: '2026-07-10', kg: 82.4 }, { date: '2026-07-10', kg: 82.0 }],
    })!
    expect(f.lead).toContain('2 so far')
    expect(f.lead).not.toContain('first weigh-in')
    expect(f.lead).not.toContain('two more') // never claim a count that is already wrong
  })

  it('prioritizes deterministically: train beats weight beats macros beats water beats recovery beats stream', () => {
    const all: FirstFindInput = {
      sessions7: 2,
      weighIns: [{ date: '2026-07-10', kg: 82 }],
      mealDays7: 3,
      proteinTodayG: 141,
      waterTodayMl: 1500,
      sleepLastH: 7.2,
      recoveryLast: 66,
      streams: [{ label: 'Meditation', reportCount: 4 }],
      units: 'metric',
    }
    expect(buildFirstFind(all)!.domain).toBe('train')
    expect(buildFirstFind({ ...all, sessions7: 0 })!.domain).toBe('weight')
    expect(buildFirstFind({ ...all, sessions7: 0, weighIns: [] })!.domain).toBe('macros')
    expect(buildFirstFind({ ...all, sessions7: 0, weighIns: [], mealDays7: 0 })!.domain).toBe('water')
    expect(buildFirstFind({ ...all, sessions7: 0, weighIns: [], mealDays7: 0, waterTodayMl: 0 })!.domain).toBe('recovery')
    expect(buildFirstFind({ ...all, sessions7: 0, weighIns: [], mealDays7: 0, waterTodayMl: 0, sleepLastH: null, recoveryLast: null })!.domain).toBe('stream')
  })

  it('carries the real session count and grammar for training', () => {
    const one = buildFirstFind({ ...EMPTY, sessions7: 1 })!
    expect(one.lead).toContain('1 session logged')
    expect(one.receipts).toEqual(['1 session this week'])
    const three = buildFirstFind({ ...EMPTY, sessions7: 3 })!
    expect(three.lead).toContain('3 sessions logged')
    expect(three.action!.href).toBe('/app/fitness/log')
  })

  it('reads water in liters from the real ml', () => {
    const f = buildFirstFind({ ...EMPTY, waterTodayMl: 1250 })!
    expect(f.domain).toBe('water')
    expect(f.lead).toContain('1.3 L')
    expect(f.receipts).toEqual(['1.3 L today'])
  })

  it('picks the busiest stream (then alphabetical) and never one with zero reports', () => {
    const f = buildFirstFind({
      ...EMPTY,
      streams: [
        { label: 'Reading', reportCount: 0 },
        { label: 'Meditation', reportCount: 2 },
        { label: 'Guitar', reportCount: 2 },
      ],
    })!
    expect(f.domain).toBe('stream')
    expect(f.lead).toContain('guitar')
    expect(f.receipts).toEqual(['2 reports from guitar'])
    expect(buildFirstFind({ ...EMPTY, streams: [{ label: 'Reading', reportCount: 0 }] })).toBeNull()
  })

  it('keeps every variant honest: receipts <= 2, the lever verbatim in the lead, no em dashes', () => {
    const variants = [
      buildFirstFind({ ...EMPTY, sessions7: 2 })!,
      buildFirstFind({ ...EMPTY, weighIns: [{ date: '2026-07-10', kg: 80 }] })!,
      buildFirstFind({ ...EMPTY, mealDays7: 2, proteinTodayG: 130 })!,
      buildFirstFind({ ...EMPTY, waterTodayMl: 500 })!,
      buildFirstFind({ ...EMPTY, sleepLastH: 7.5, recoveryLast: 70 })!,
      buildFirstFind({ ...EMPTY, recoveryLast: 55 })!,
      buildFirstFind({ ...EMPTY, streams: [{ label: 'Meditation', reportCount: 1 }] })!,
    ]
    for (const f of variants) {
      expect(f.receipts.length).toBeGreaterThan(0)
      expect(f.receipts.length).toBeLessThanOrEqual(2)
      expect(f.lever).toBeTruthy()
      expect(f.lead).toContain(f.lever!)
      expect(f.lead).not.toContain('—')
      expect(f.watched).not.toContain('—')
    }
  })
})

describe('buildFeed step 3.5 — the first-find in the feed', () => {
  const FIRST = {
    domain: 'weight',
    lead: 'your first weigh-in is on the record at 82.4 kg. one more and I can read your trend.',
    watched: 'your weigh-ins',
    receipts: ['82.4 kg · 2026-07-10'],
    lever: 'on the record',
    action: { label: 'log a weigh-in', href: '/app/fitness/progress' },
  }

  it('gives a new user with one weigh-in the first-find (never the bare starter)', () => {
    const feed = buildFeed({ convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: true, first: FIRST })
    expect(feed).toHaveLength(1)
    expect(feed[0].source).toBe('first')
    expect(feed[0].patternKey).toBe('first+weight') // routed through the noticed_ledger, once ever
    expect(feed[0].rarity).toBe('common')
    expect(feed[0].impact).toBe('up')
    expect(feed[0].goalTitle).toBeNull()
    expect(feed[0].receipts).toEqual(['82.4 kg · 2026-07-10'])
    expect(rarityForNotice(feed[0])).toBe('common') // COMMON by construction
  })

  it('never shows the first-find when a real notice fired (momentum wins)', () => {
    const feed = buildFeed({
      convergence: null, drift: null,
      rows: [{ id: 'g1', title: 'get lean', state: 'on-track', detail: '-0.5%/wk', spark: [82, 81.6], hint: null, metric: 'weight' }],
      starter: STARTER, hasAnyData: true, first: FIRST,
    })
    expect(feed.some(f => f.source === 'first')).toBe(false)
    expect(feed[0].source).toBe('momentum')
  })

  it('still falls back to the starter when there is no first-find either', () => {
    const feed = buildFeed({ convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: false, first: null })
    expect(feed).toHaveLength(1)
    expect(feed[0].source).toBe('starter')
  })
})

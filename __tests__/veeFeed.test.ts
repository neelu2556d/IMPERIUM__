import { buildFeed, type FeedNotice } from '@/lib/insights/feed'
import type { TickerRow } from '@/lib/insights/ticker'

function row(p: Partial<TickerRow>): TickerRow {
  return { id: 'g', title: 'a goal', state: 'unknown', detail: null, spark: [], hint: null, metric: null, ...p }
}
const STARTER = { kind: 'watching' as const, headline: 'I am watching get lean', body: 'across your training. nothing yet.', goalTitle: 'get lean', watching: ['training'] }

describe('buildFeed', () => {
  it('leads with the deep oracle convergence when present', () => {
    const feed = buildFeed({
      convergence: { goal: { id: 'g1', title: 'bench 225' }, domainsHit: ['train', 'recovery'], receipts: [{ text: 'bench stuck at 180 for 4 weeks' }] },
      drift: null, rows: [], starter: STARTER, hasAnyData: true,
    })
    expect(feed[0].source).toBe('oracle')
    expect(feed[0].goalTitle).toBe('bench 225')
    expect(feed[0].receipts.length).toBeGreaterThan(0)
  })

  it('includes the drift nudge and momentum as separate flippable notices', () => {
    const feed = buildFeed({
      convergence: null,
      drift: { kind: 'train', line: 'it has been a few days', sub: 'last session was four days ago.', goalId: 'g1' },
      rows: [row({ id: 'g2', title: 'train more', state: 'on-track', metric: 'training', detail: '3.2x/wk' })],
      starter: STARTER, hasAnyData: true,
    })
    expect(feed.some(f => f.source === 'drift')).toBe(true)
    expect(feed.some(f => f.source === 'momentum' && f.impact === 'up')).toBe(true)
  })

  it('falls back to exactly the starter when nothing else fired (never empty)', () => {
    const feed = buildFeed({ convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: false })
    expect(feed).toHaveLength(1)
    expect(feed[0].source).toBe('starter')
  })

  it('always returns at least one notice', () => {
    const feed = buildFeed({ convergence: null, drift: null, rows: [row({ state: 'holding' })], starter: STARTER, hasAnyData: true })
    expect(feed.length).toBeGreaterThanOrEqual(1)
  })

  it('upgrades the momentum lead to the projection read when goalReads has one', () => {
    const feed = buildFeed({
      convergence: null, drift: null,
      rows: [row({ id: 'g1', title: 'bench 225', state: 'on-track', metric: 'lift', detail: '75 → 85', spark: [75, 80, 85] })],
      starter: STARTER, hasAnyData: true,
      goalReads: { g1: 'your bench press is climbing about 2.5 kg a week, now at 85 kg.' },
    })
    const m = feed.find(f => f.source === 'momentum')!
    expect(m.lead).toBe('your bench press is climbing about 2.5 kg a week, now at 85 kg.')
    expect(m.lead).not.toContain('keep it going') // the canned line is replaced
  })

  it('keeps the canned momentum lead when goalReads has nothing for that goal', () => {
    const feed = buildFeed({
      convergence: null, drift: null,
      rows: [row({ id: 'g2', title: 'train more', state: 'on-track', metric: 'training', detail: '3.2x/wk' })],
      starter: STARTER, hasAnyData: true,
      goalReads: { g1: 'a different goal projection.' },
    })
    const m = feed.find(f => f.source === 'momentum')!
    expect(m.lead).toBe('you are moving on train more, keep it going.')
  })

  it('places the cross-domain fusion seam as a high-priority notice', () => {
    const feed = buildFeed({
      convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: true,
      fusion: { why: 'You train more in the weeks you sleep more. Your better-sleep weeks averaged 4 sessions.', receipts: ['7.5 h nights, 4 sessions', '5.5 h nights, 2 sessions'] },
    })
    expect(feed[0].source).toBe('fusion')
    expect(feed[0].lead.toLowerCase()).toContain('sleep more')
    expect(feed[0].receipts.length).toBe(2)
    expect(feed[0].impact).toBe('up')
  })

  it('lets the deep oracle still lead when both it and the fusion seam fired', () => {
    const feed = buildFeed({
      convergence: { goal: { id: 'g1', title: 'bench 225' }, domainsHit: ['train'], receipts: [{ text: 'bench stuck' }] },
      drift: null, rows: [], starter: STARTER, hasAnyData: true,
      fusion: { why: 'You train more in the weeks you sleep more.', receipts: ['a', 'b'] },
    })
    expect(feed[0].source).toBe('oracle')
    expect(feed.some(f => f.source === 'fusion')).toBe(true)
  })

  it('labels a lift momentum with lifts, not weigh-ins (the §01 mismatch fix)', () => {
    const feed = buildFeed({
      convergence: null, drift: null,
      rows: [row({ id: 'g1', title: 'bench 225', state: 'on-track', metric: 'lift', detail: '75 → 85' })],
      starter: STARTER, hasAnyData: true,
    })
    const m = feed.find(f => f.source === 'momentum')!
    expect(m.watched).not.toMatch(/weigh-?in/i)
    expect(m.watched).toMatch(/lift/i)
  })

  it('carries the fusion seam its own watched label + rarity (caffeine, not always sleep)', () => {
    const feed = buildFeed({
      convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: true,
      fusion: { why: 'Your recovery runs lower after heavy caffeine days.', receipts: ['a', 'b'], watched: 'caffeine + recovery', rarity: 'uncommon' },
    })
    const f = feed.find(n => n.source === 'fusion')!
    expect(f.watched).toBe('caffeine + recovery')
    expect(f.rarity).toBe('uncommon')
  })

  it('defaults the fusion watched label to sleep + training when none is passed', () => {
    const feed = buildFeed({
      convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: true,
      fusion: { why: 'You train more in the weeks you sleep more.', receipts: ['a', 'b'] },
    })
    const f = feed.find(n => n.source === 'fusion')!
    expect(f.watched).toBe('sleep + training')
    expect(f.rarity).toBe('uncommon') // a single cross-domain link
  })

  it('carries the fusion pattern key onto the notice (so a show can be logged to its cooldown)', () => {
    const feed = buildFeed({
      convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: true,
      fusion: { why: 'Your recovery runs lower after heavy caffeine days.', receipts: ['a', 'b'], watched: 'caffeine + recovery', rarity: 'uncommon', patternKey: 'caffeine+recovery' },
    })
    const f = feed.find(n => n.source === 'fusion')!
    expect(f.patternKey).toBe('caffeine+recovery')
  })

  it('grades the deep oracle convergence above the single-link seams (epic when multi-domain)', () => {
    const feed = buildFeed({
      convergence: { goal: { id: 'g1', title: 'bench 225' }, domainsHit: ['train', 'recovery'], receipts: [{ text: 'x' }] },
      drift: null, rows: [], starter: STARTER, hasAnyData: true,
    })
    expect(feed[0].rarity).toBe('epic')
  })

  it('carries the drift kind on the notice (so the Vee card can log its goal_nudges cooldown)', () => {
    const feed = buildFeed({
      convergence: null,
      drift: { kind: 'fuel', line: 'meals went quiet', sub: 'last logged meal was five days ago.', goalId: 'g1' },
      rows: [], starter: STARTER, hasAnyData: true,
    })
    const d = feed.find(f => f.source === 'drift')!
    expect(d.driftKind).toBe('fuel')
    // ...and no other source ever carries one
    const momentum = buildFeed({
      convergence: null, drift: null,
      rows: [row({ id: 'g2', title: 'train more', state: 'on-track', metric: 'training', detail: '3.2x/wk' })],
      starter: STARTER, hasAnyData: true,
    })
    expect(momentum.every(f => f.driftKind === undefined)).toBe(true)
  })

  it('grades a single-domain drift nudge as common, and never badges the starter', () => {
    const drifted = buildFeed({
      convergence: null,
      drift: { kind: 'train', line: 'it has been a few days', sub: 'last session was four days ago.', goalId: 'g1' },
      rows: [], starter: STARTER, hasAnyData: true,
    })
    expect(drifted.find(f => f.source === 'drift')!.rarity).toBe('common')

    const cold = buildFeed({ convergence: null, drift: null, rows: [], starter: STARTER, hasAnyData: false })
    expect(cold[0].source).toBe('starter')
    expect(cold[0].rarity ?? null).toBeNull()
  })
})

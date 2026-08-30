/**
 * claudeHandoff - the pure Claude prefill composer for the Vee page.
 * Honesty rules under test: quick questions only for modules with real data
 * (generic fallback when nothing is tracked), the context block never invents
 * a line for an empty field, and a contextless hop stays the bare question.
 */

import {
  buildHandoffContext,
  claudeHandoffHref,
  composePrefill,
  contextBlock,
  quickQuestions,
  type ClaudeHandoffContext,
} from '@/lib/vee/claudeHandoff'

const FULL_CTX: ClaudeHandoffContext = {
  firstName: 'Alex',
  daysLogged: 247,
  goals: [
    { title: 'Bench 100 kg', category: 'fitness', state: 'rising' },
    { title: 'Get lean', category: 'health', state: 'drifting' },
  ],
  noticeLead: 'Your late caffeine is quietly capping recovery.',
  lifeChips: [{ label: 'train', value: '3.7x/wk' }, { label: 'sleep', value: '6.8h' }],
  activeModules: ['train', 'weight', 'recovery'],
}

describe('quickQuestions', () => {
  it('offers only questions whose module has real data', () => {
    const qs = quickQuestions(['water'])
    expect(qs).toHaveLength(1)
    expect(qs[0].prompt).toContain('water')
  })

  it('never asks about water for someone who never logged water', () => {
    const qs = quickQuestions(['train', 'macros'])
    expect(qs.some(q => q.prompt.includes('water'))).toBe(false)
  })

  it('caps at four questions', () => {
    const qs = quickQuestions(['train', 'recovery', 'macros', 'weight', 'water', 'finance', 'brand', 'supplements'])
    expect(qs).toHaveLength(4)
  })

  it('falls back to exactly two generic questions when nothing is tracked', () => {
    for (const input of [[], undefined, null] as const) {
      const qs = quickQuestions(input as string[] | undefined | null)
      expect(qs).toHaveLength(2)
      expect(qs.every(q => q.title.length > 0 && q.prompt.length > 0)).toBe(true)
    }
  })

  it('ignores unknown module names instead of inventing a question', () => {
    expect(quickQuestions(['not-a-module'])).toHaveLength(2) // generic fallback
  })
})

describe('contextBlock / composePrefill', () => {
  it('carries every real field', () => {
    const block = contextBlock(FULL_CTX)
    expect(block).toContain('Alex')
    expect(block).toContain('247')
    expect(block).toContain('Bench 100 kg (fitness, rising)')
    expect(block).toContain('Get lean (health, drifting)')
    expect(block).toContain('late caffeine')
    expect(block).toContain('train 3.7x/wk')
    expect(block).toContain('train, weight, recovery')
  })

  it('omits empty fields instead of writing placeholders', () => {
    const block = contextBlock({
      firstName: null, daysLogged: 0, goals: [], noticeLead: null, lifeChips: [], activeModules: [],
    })
    expect(block).toBe('')
  })

  it('collapses to the bare question with no context', () => {
    expect(composePrefill('how is my week?', null)).toBe('how is my week?')
    expect(composePrefill('  how is my week?  ', undefined)).toBe('how is my week?')
  })

  it('prefill = question first, context block after', () => {
    const p = composePrefill('am i overtraining?', FULL_CTX)
    expect(p.startsWith('am i overtraining?')).toBe(true)
    expect(p).toContain('Context from my Vitality dashboard')
  })

  it('href encodes the whole prefill for claude.ai/new', () => {
    const href = claudeHandoffHref('am i overtraining?', FULL_CTX)
    expect(href.startsWith('https://claude.ai/new?q=')).toBe(true)
    const decoded = decodeURIComponent(href.slice('https://claude.ai/new?q='.length))
    expect(decoded).toContain('am i overtraining?')
    expect(decoded).toContain('Bench 100 kg')
  })

  it('clips long goal titles and the notice lead so the block stays compact', () => {
    const block = contextBlock({
      ...FULL_CTX,
      goals: [{ title: 'x'.repeat(200), category: 'fitness', state: 'rising' }],
      noticeLead: 'y'.repeat(400),
    })
    expect(block).toContain('x'.repeat(59))
    expect(block).not.toContain('x'.repeat(80))
    expect(block).not.toContain('y'.repeat(200))
  })

  it('keeps the href under 4000 chars for 5 max-length Cyrillic titles + a 600-char question', () => {
    const cyr = 'ц'.repeat(200) // the server cap on a goal title
    const question = 'щ'.repeat(600) // the ask-composer cap
    const href = claudeHandoffHref(question, {
      ...FULL_CTX,
      goals: Array.from({ length: 5 }, () => ({ title: cyr, category: null, state: 'no data yet' })),
      noticeLead: 'ж'.repeat(300),
    })
    expect(href.length).toBeLessThan(4000)
    // The bare question always survives the clamp intact.
    const decoded = decodeURIComponent(href.slice('https://claude.ai/new?q='.length))
    expect(decoded).toContain(question)
  })
})

describe('buildHandoffContext', () => {
  it('maps goals to board state words and takes the visible (first) notice lead', () => {
    const ctx = buildHandoffContext({
      firstName: 'Alex',
      daysLogged: 12,
      goals: [
        { id: 'g1', title: 'bench 100kg', cleanTitle: 'Bench 100 kg', category: 'fitness' },
        { id: 'g2', title: 'read 12 books', cleanTitle: null, category: 'mind' },
      ],
      rows: [{ id: 'g1', state: 'on-track' }],
      feed: [{ lead: 'first lead' }, { lead: 'second lead' }],
      lifeChips: [{ label: 'train', value: '3x/wk' }],
      activeModules: ['train'],
    })
    expect(ctx.goals[0]).toEqual({ title: 'Bench 100 kg', category: 'fitness', state: 'rising' })
    expect(ctx.goals[1]).toEqual({ title: 'read 12 books', category: 'mind', state: 'no data yet' })
    expect(ctx.noticeLead).toBe('first lead')
  })
})

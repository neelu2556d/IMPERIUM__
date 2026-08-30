import { shouldEscalate, escalationTimeoutMs } from '@/lib/nutrition/escalate'

// The escalation gate: when the fast floor model (Sonnet) flags that it could
// NOT commit confidently, we re-run the photo on the stronger model (Opus).
describe('shouldEscalate', () => {
  it('escalates when the floor model is uncertain', () => {
    expect(shouldEscalate({ state: 'uncertain' })).toBe(true)
  })

  it('escalates when the photo is clear but a food is unidentifiable (can_tell)', () => {
    expect(shouldEscalate({ state: 'can_tell' })).toBe(true)
  })

  it('does NOT escalate a confident parse — there is no doubt to resolve', () => {
    expect(shouldEscalate({ state: 'confident' })).toBe(false)
  })

  it('does NOT escalate a bad photo — a stronger model cannot fix a bad photo', () => {
    expect(shouldEscalate({ state: 'bad_photo' })).toBe(false)
  })

  it('does NOT escalate when there is nothing to act on', () => {
    expect(shouldEscalate(null)).toBe(false)
    expect(shouldEscalate(undefined)).toBe(false)
    expect(shouldEscalate({})).toBe(false)
  })
})

// Keeps the floor + escalation calls inside the serverless function budget so
// the route can never hit Vercel's 60s wall (which surfaced as a 504).
describe('escalationTimeoutMs', () => {
  it('gives the escalation the remaining budget when there is plenty of time', () => {
    expect(escalationTimeoutMs(20_000, { budgetMs: 50_000, minMs: 9_000 })).toBe(30_000)
  })

  it('returns 0 (skip) when too little time is left for a second frontier call', () => {
    expect(escalationTimeoutMs(45_000, { budgetMs: 50_000, minMs: 9_000 })).toBe(0)
  })

  it('allows escalation exactly at the minimum boundary', () => {
    expect(escalationTimeoutMs(41_000, { budgetMs: 50_000, minMs: 9_000 })).toBe(9_000)
  })

  it('returns 0 when the floor already blew the whole budget', () => {
    expect(escalationTimeoutMs(60_000, { budgetMs: 50_000, minMs: 9_000 })).toBe(0)
  })
})

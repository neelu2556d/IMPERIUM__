import { isDuplicateFact, rowToFact, selectRelevantFacts, type UserFactRow } from '@/lib/memory/userFacts'

const row = (over: Partial<UserFactRow> = {}): UserFactRow => ({
  id: 'f1', user_id: 'u1', source: 'vitals', kind: 'context',
  body: 'rough sleep in dorm', salience: '0.80',
  created_at: '2026-06-09T00:00:00Z', last_referenced_at: null, expires_at: null,
  ...over,
})

describe('isDuplicateFact', () => {
  const existing = ['sharp stabbing knee pain limits leg training']

  it('catches the real-world knee re-logs that piled up in the demo', () => {
    expect(isDuplicateFact('sharp knee pain today, likely from legs training', existing)).toBe(true)
    expect(isDuplicateFact('experiencing knee pain today', existing)).toBe(true)
    expect(isDuplicateFact('reported knee pain the day after legs training on 2026-06-09', existing)).toBe(true)
  })

  it('keeps a genuinely new fact about a different subject', () => {
    expect(isDuplicateFact('prefers training in the morning before class', existing)).toBe(false)
    expect(isDuplicateFact('wants to hit 180lb bodyweight', existing)).toBe(false)
  })

  it('is empty-safe', () => {
    expect(isDuplicateFact('knee pain', [])).toBe(false)
    expect(isDuplicateFact('', existing)).toBe(false)
  })
})

describe('rowToFact', () => {
  it('coerces numeric salience string to number', () => {
    expect(rowToFact(row()).salience).toBe(0.8)
  })
  it('maps snake_case to camelCase', () => {
    const f = rowToFact(row({ last_referenced_at: '2026-06-09T01:00:00Z' }))
    expect(f.body).toBe('rough sleep in dorm')
    expect(f.lastReferencedAt).toBe('2026-06-09T01:00:00Z')
  })
})

describe('selectRelevantFacts', () => {
  const facts = [
    rowToFact(row({ id: 'a', salience: '0.90', kind: 'hobby' })),
    rowToFact(row({ id: 'b', salience: '0.20', kind: 'context' })),
    rowToFact(row({ id: 'c', salience: '0.60', kind: 'stressor', expires_at: '2020-01-01T00:00:00Z' })),
  ]
  it('drops expired facts relative to now', () => {
    const ids = selectRelevantFacts(facts, { now: '2026-06-09T00:00:00Z' }).map(f => f.id)
    expect(ids).not.toContain('c')
  })
  it('filters by minSalience', () => {
    const ids = selectRelevantFacts(facts, { now: '2026-06-09T00:00:00Z', minSalience: 0.5 }).map(f => f.id)
    expect(ids).toEqual(['a'])
  })
  it('sorts by salience desc and respects limit', () => {
    const out = selectRelevantFacts(facts, { now: '2026-06-09T00:00:00Z', limit: 1 })
    expect(out.map(f => f.id)).toEqual(['a'])
  })
})

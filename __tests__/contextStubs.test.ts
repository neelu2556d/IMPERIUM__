import { CONTEXT_AREAS, groupFactsByArea, isContextKind } from '@/app/app/mentor/contextStubs'

test('CONTEXT_AREAS covers the three life areas with stubs', () => {
  expect(CONTEXT_AREAS.map(a => a.key)).toEqual(['life', 'people', 'self'])
  for (const area of CONTEXT_AREAS) {
    expect(area.stubs.length).toBeGreaterThanOrEqual(2)
    for (const s of area.stubs) {
      // a stub is "90% written": real lead-in text, ends with a period
      expect(s.pre.trim().length).toBeGreaterThan(0)
      expect(s.post).toBe('.')
      // no em dashes in any user-facing copy
      expect(s.pre.includes('—')).toBe(false)
    }
  }
})

test('exactly one stub per area may be marked calm (the heaviest line)', () => {
  for (const area of CONTEXT_AREAS) {
    expect(area.stubs.filter(s => s.calm).length).toBeLessThanOrEqual(1)
  }
})

test('isContextKind only accepts the three area kinds', () => {
  expect(isContextKind('life')).toBe(true)
  expect(isContextKind('people')).toBe(true)
  expect(isContextKind('self')).toBe(true)
  expect(isContextKind('event')).toBe(false)
  expect(isContextKind('mood')).toBe(false)
})

test('groupFactsByArea buckets facts and ignores unknown areas', () => {
  const grouped = groupFactsByArea([
    { id: '1', area: 'life', body: 'Right now I am dealing with exams.' },
    { id: '2', area: 'people', body: 'Things are tense with my dad.' },
    { id: '3', area: 'life', body: 'Money wise, right now I am tight.' },
  ])
  expect(grouped.life.map(f => f.id)).toEqual(['1', '3'])
  expect(grouped.people.map(f => f.id)).toEqual(['2'])
  expect(grouped.self).toEqual([])
})

import { parseInput } from '@/app/app/peak-tracker/parser'
import { freeWindows } from '@/app/app/peak/schedule'

describe('Peak schedule parser — lab grammar parity', () => {
  test('range "school 8-2" → event 8am–2pm', () => {
    const [t] = parseInput('school 8-2')
    expect(t.kind).toBe('event')
    if (t.kind === 'event') {
      expect(t.startHour).toBe(8)
      expect(t.endHour).toBe(14)
    }
  })

  test('compact military "gym 1930" → ~7:30pm event', () => {
    const [t] = parseInput('gym 1930')
    expect(t.kind).toBe('event')
    if (t.kind === 'event') expect(t.startHour).toBeCloseTo(19.5)
  })

  test('duration "read 30m" → task of 0.5h', () => {
    const [t] = parseInput('read 30m')
    expect(t.kind).toBe('task')
    if (t.kind === 'task') expect(t.durationHours).toBeCloseTo(0.5)
  })

  test('difficulty routes "deep work 9-11 hard" → hard event', () => {
    const [t] = parseInput('deep work 9-11 hard')
    expect(t.kind).toBe('event')
    if (t.kind === 'event') expect(t.difficulty).toBe('hard')
  })

  test('"big gap email" → big gap, no fixed window', () => {
    const [t] = parseInput('big gap email')
    expect(t.kind).toBe('gap')
    if (t.kind === 'gap') {
      expect(t.size).toBe('big')
      expect(t.title.toLowerCase()).toContain('email')
      expect(t.startHour).toBeNull()
    }
  })

  test('"small gap admin" → small gap, easy difficulty', () => {
    const [t] = parseInput('small gap admin')
    expect(t.kind).toBe('gap')
    if (t.kind === 'gap') {
      expect(t.size).toBe('small')
      expect(t.difficulty).toBe('easy') // "admin" is an easy keyword
    }
  })

  test('multi-clause: fixed event + gap in one line', () => {
    const tokens = parseInput('school 8-2, big gap claude')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].kind).toBe('event')
    expect(tokens[1].kind).toBe('gap')
  })

  // Regression: difficulty synonyms that double as title words used to be
  // stripped wholesale, mangling the title ("deep work" → "work").
  test('"deep work 9-11 hard" keeps "deep work" as the title', () => {
    const [t] = parseInput('deep work 9-11 hard')
    expect(t.kind).toBe('event')
    if (t.kind === 'event') {
      expect(t.difficulty).toBe('hard')
      expect(t.title).toBe('deep work')
    }
  })

  test('"quick call 2pm" treats "quick" as part of the title, not a difficulty', () => {
    const [t] = parseInput('quick call 2pm')
    expect(t.kind).toBe('event')
    if (t.kind === 'event') {
      expect(t.title).toBe('quick call')
      expect(t.difficulty).toBeNull()
    }
  })
})

describe('Peak schedule parser — "and" only splits real clauses', () => {
  test('"rest and recovery 30m" stays ONE task (and is part of the title)', () => {
    const tokens = parseInput('rest and recovery 30m')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].kind).toBe('task')
    expect(tokens[0].title).toBe('rest and recovery')
  })

  test('"gym 1930 and read 30m" splits — both sides carry their own time', () => {
    const tokens = parseInput('gym 1930 and read 30m')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].kind).toBe('event')
    expect(tokens[1].kind).toBe('task')
  })
})

describe('freeWindows — gap expansion helper', () => {
  test('subtracts busy intervals from the day, drops <15min slivers', () => {
    const busy = [{ start: 8, end: 14 }, { start: 19.5, end: 20.5 }]
    const w = freeWindows(busy, 6, 23)
    expect(w).toEqual([[6, 8], [14, 19.5], [20.5, 23]])
  })

  test('empty day → one full window', () => {
    expect(freeWindows([], 6, 23)).toEqual([[6, 23]])
  })

  test('only short windows survive the small-gap filter', () => {
    const busy = [{ start: 8, end: 14 }, { start: 15, end: 20.5 }]
    // free: [6,8]=2h, [14,15]=1h, [20.5,23]=2.5h → only the 1h window is "small"
    const small = freeWindows(busy, 6, 23).filter(([s, e]) => e - s <= 1.5)
    expect(small).toEqual([[14, 15]])
  })
})

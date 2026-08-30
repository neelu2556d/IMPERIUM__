import { REPORT_KINDS, validateReport, normalizeKey } from '@/lib/tiles/reportContract'

// The tile report() contract is the seam where an untrusted, user-editable
// sealed tile feeds one numeric life-stream into the data flywheel. A malformed
// or hostile payload must be safely rejected or normalized here, never corrupt
// stored data and never throw into the host. These tests pin that discipline.

const VALID = {
  key: 'beer',
  label: 'Beers',
  value: 2,
  date: '2026-06-28',
  kind: 'intake' as const,
  goalDirection: 'down' as const,
}

describe('report contract validation — happy path', () => {
  test('accepts a well-formed stream and returns it normalized', () => {
    const r = validateReport(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.stream).toEqual({
        key: 'beer',
        label: 'Beers',
        value: 2,
        date: '2026-06-28',
        kind: 'intake',
        goalDirection: 'down',
      })
    }
  })

  test('keeps the exact key order key,label,value,date,kind,goalDirection', () => {
    const r = validateReport(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.stream)).toEqual(['key', 'label', 'value', 'date', 'kind', 'goalDirection'])
    }
  })

  test('goalDirection is optional and omitted from the result when absent', () => {
    const { goalDirection: _drop, ...noDir } = VALID
    const r = validateReport(noDir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('goalDirection' in r.stream).toBe(false)
      expect(Object.keys(r.stream)).toEqual(['key', 'label', 'value', 'date', 'kind'])
    }
  })

  test('accepts every kind in the fixed taxonomy', () => {
    for (const kind of REPORT_KINDS) {
      expect(validateReport({ ...VALID, kind }).ok).toBe(true)
    }
  })

  test('accepts every goal direction', () => {
    for (const goalDirection of ['up', 'down', 'neutral'] as const) {
      expect(validateReport({ ...VALID, goalDirection }).ok).toBe(true)
    }
  })

  test('accepts zero and negative values', () => {
    expect(validateReport({ ...VALID, value: 0 }).ok).toBe(true)
    expect(validateReport({ ...VALID, value: -5 }).ok).toBe(true)
  })

  test('the 7 kinds are exactly the fixed taxonomy, in order', () => {
    expect([...REPORT_KINDS]).toEqual(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done'])
  })
})

describe('report contract validation — payload shape and hostility', () => {
  const notObjects: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', [1, 2, 3]],
  ]
  test.each(notObjects)('rejects %s without throwing', (_label, input) => {
    let r: ReturnType<typeof validateReport> | undefined
    expect(() => {
      r = validateReport(input)
    }).not.toThrow()
    expect(r?.ok).toBe(false)
  })

  test('drops unexpected extra fields (rebuilds the stream from scratch)', () => {
    const r = validateReport({ ...VALID, evil: 'DROP TABLE', extra: 99 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.stream)).toEqual(['key', 'label', 'value', 'date', 'kind', 'goalDirection'])
      expect('evil' in r.stream).toBe(false)
      expect('extra' in r.stream).toBe(false)
    }
  })

  test('never throws even when a field is a throwing getter', () => {
    const hostile = {
      get key(): string {
        throw new Error('boom')
      },
      label: 'X',
      value: 1,
      date: '2026-06-28',
      kind: 'count',
    }
    let r: ReturnType<typeof validateReport> | undefined
    expect(() => {
      r = validateReport(hostile)
    }).not.toThrow()
    expect(r?.ok).toBe(false)
  })
})

describe('report contract validation — key', () => {
  test('rejects a missing, non-string, empty, or whitespace-only key', () => {
    const { key: _drop, ...noKey } = VALID
    expect(validateReport(noKey).ok).toBe(false)
    expect(validateReport({ ...VALID, key: 123 }).ok).toBe(false)
    expect(validateReport({ ...VALID, key: null }).ok).toBe(false)
    expect(validateReport({ ...VALID, key: '' }).ok).toBe(false)
    expect(validateReport({ ...VALID, key: '   ' }).ok).toBe(false)
  })

  test('trims and collapses whitespace in the key', () => {
    const r = validateReport({ ...VALID, key: '  beer   time  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.stream.key).toBe('beer time')
  })

  test('rejects an over-length key rather than truncating stream identity', () => {
    const r = validateReport({ ...VALID, key: 'k'.repeat(65) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/64/)
  })

  test('accepts a key exactly at the max length', () => {
    expect(validateReport({ ...VALID, key: 'k'.repeat(64) }).ok).toBe(true)
  })
})

describe('report contract validation — label', () => {
  test('rejects a missing, non-string, or empty label', () => {
    const { label: _drop, ...noLabel } = VALID
    expect(validateReport(noLabel).ok).toBe(false)
    expect(validateReport({ ...VALID, label: 42 }).ok).toBe(false)
    expect(validateReport({ ...VALID, label: '' }).ok).toBe(false)
    expect(validateReport({ ...VALID, label: '   ' }).ok).toBe(false)
  })

  test('clamps an over-length label instead of dropping the datapoint', () => {
    const r = validateReport({ ...VALID, label: 'L'.repeat(500) })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.stream.label.length).toBeLessThanOrEqual(120)
      expect(r.stream.value).toBe(2)
    }
  })

  test('strips control characters and collapses whitespace in the label', () => {
    const r = validateReport({ ...VALID, label: '  A  \n B  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.stream.label).toBe('A B')
  })
})

describe('report contract validation — value', () => {
  test('rejects a non-number value', () => {
    expect(validateReport({ ...VALID, value: '2' }).ok).toBe(false)
    expect(validateReport({ ...VALID, value: null }).ok).toBe(false)
    expect(validateReport({ ...VALID, value: {} }).ok).toBe(false)
  })

  test('rejects NaN and both infinities', () => {
    expect(validateReport({ ...VALID, value: NaN }).ok).toBe(false)
    expect(validateReport({ ...VALID, value: Infinity }).ok).toBe(false)
    expect(validateReport({ ...VALID, value: -Infinity }).ok).toBe(false)
  })

  test('clamps a finite but absurd magnitude into range', () => {
    const big = validateReport({ ...VALID, value: 1e30 })
    expect(big.ok).toBe(true)
    if (big.ok) expect(big.stream.value).toBe(1e9)

    const small = validateReport({ ...VALID, value: -1e30 })
    expect(small.ok).toBe(true)
    if (small.ok) expect(small.stream.value).toBe(-1e9)
  })

  test('folds -0 to 0 for deterministic storage', () => {
    const r = validateReport({ ...VALID, value: -0 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.is(r.stream.value, 0)).toBe(true)
  })
})

describe('report contract validation — date', () => {
  test('rejects a missing or non-string date', () => {
    const { date: _drop, ...noDate } = VALID
    expect(validateReport(noDate).ok).toBe(false)
    expect(validateReport({ ...VALID, date: 20260628 }).ok).toBe(false)
  })

  test('rejects a wrong-format date (must be YYYY-MM-DD)', () => {
    for (const date of ['2026-6-28', '06/28/2026', '2026-06-28T00:00', '2026-06', 'yesterday', '']) {
      expect(validateReport({ ...VALID, date }).ok).toBe(false)
    }
  })

  test('rejects a well-formatted but impossible calendar date', () => {
    for (const date of ['2026-13-40', '2026-00-10', '2026-02-30', '2026-04-31', '2026-06-00']) {
      expect(validateReport({ ...VALID, date }).ok).toBe(false)
    }
  })

  test('accepts a valid leap day and rejects a non-leap Feb 29', () => {
    expect(validateReport({ ...VALID, date: '2024-02-29' }).ok).toBe(true)
    expect(validateReport({ ...VALID, date: '2026-02-29' }).ok).toBe(false)
  })
})

describe('report contract validation — kind and goalDirection', () => {
  test('rejects a missing, non-string, or unknown kind', () => {
    const { kind: _drop, ...noKind } = VALID
    expect(validateReport(noKind).ok).toBe(false)
    expect(validateReport({ ...VALID, kind: 42 }).ok).toBe(false)
    expect(validateReport({ ...VALID, kind: 'vibes' }).ok).toBe(false)
    expect(validateReport({ ...VALID, kind: 'Intake' }).ok).toBe(false)
  })

  test('rejects an invalid goalDirection when present', () => {
    expect(validateReport({ ...VALID, goalDirection: 'sideways' }).ok).toBe(false)
    expect(validateReport({ ...VALID, goalDirection: 1 }).ok).toBe(false)
    expect(validateReport({ ...VALID, goalDirection: null }).ok).toBe(false)
  })
})

describe('canonical key normalization', () => {
  test('beer and every alias fold to the alcohol family', () => {
    for (const alias of ['beer', 'beers', 'brew', 'brews', 'pint', 'pints', 'drink', 'drinks', 'alcohol']) {
      expect(normalizeKey(alias)).toBe('alcohol')
    }
  })

  test('lowercases and trims, and passes an unknown key through cleaned', () => {
    expect(normalizeKey('  BREW ')).toBe('alcohol')
    expect(normalizeKey('  Pushups ')).toBe('pushups')
    expect(normalizeKey('mood')).toBe('mood')
  })

  test('the calorie family rejoins the shipped misspelled key with honest ones', () => {
    // 'calory' is baked into already-shipped preset tiles (the -ies bug);
    // the family is what lets those streams line up with every honest key.
    for (const alias of ['calory', 'calorie', 'calories', 'kcal', ' KCAL ']) {
      expect(normalizeKey(alias)).toBe('calories')
    }
  })
})

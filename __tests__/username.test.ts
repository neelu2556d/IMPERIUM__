import {
  normalizeUsername,
  validateUsername,
  isReservedUsername,
  USERNAME_MIN,
  USERNAME_MAX,
} from '@/lib/profiles/username'

describe('username (Arts District v2 — identity)', () => {
  describe('normalizeUsername', () => {
    test('lowercases and trims', () => {
      expect(normalizeUsername('  AlexWise  ')).toBe('alexwise')
    })

    test('strips a single leading @', () => {
      expect(normalizeUsername('@alexwise')).toBe('alexwise')
    })

    test('leaves inner characters untouched (no silent rewrite)', () => {
      // normalize only lowercases/trims/strips @ — it does NOT remove
      // illegal chars; validation rejects those so the user sees an error
      // instead of a surprise handle.
      expect(normalizeUsername('Alex Wise!')).toBe('alex wise!')
    })
  })

  describe('validateUsername', () => {
    test('accepts a clean handle', () => {
      const r = validateUsername('alexwise')
      expect(r.ok).toBe(true)
      expect(r.value).toBe('alexwise')
    })

    test('accepts letters, numbers and underscores', () => {
      expect(validateUsername('luke_wise_2').ok).toBe(true)
    })

    test('normalizes case + @ before validating', () => {
      const r = validateUsername('@AlexWise')
      expect(r.ok).toBe(true)
      expect(r.value).toBe('alexwise')
    })

    test(`rejects shorter than ${USERNAME_MIN}`, () => {
      expect(validateUsername('ab').ok).toBe(false)
    })

    test(`rejects longer than ${USERNAME_MAX}`, () => {
      expect(validateUsername('a'.repeat(USERNAME_MAX + 1)).ok).toBe(false)
    })

    test('rejects spaces and punctuation', () => {
      expect(validateUsername('alex wise').ok).toBe(false)
      expect(validateUsername('alex.wise').ok).toBe(false)
      expect(validateUsername('alex-wise').ok).toBe(false)
      expect(validateUsername('alex!').ok).toBe(false)
    })

    test('rejects empty', () => {
      expect(validateUsername('').ok).toBe(false)
      expect(validateUsername('   ').ok).toBe(false)
    })

    test('rejects reserved handles (route + brand collisions)', () => {
      expect(validateUsername('admin').ok).toBe(false)
      expect(validateUsername('Vitality').ok).toBe(false)
      expect(validateUsername('app').ok).toBe(false)
      expect(validateUsername('u').ok).toBe(false)
      expect(validateUsername('vee').ok).toBe(false)
    })

    test('every rejection carries a human-readable reason', () => {
      const r = validateUsername('a')
      expect(r.ok).toBe(false)
      expect(typeof r.error).toBe('string')
      expect(r.error!.length).toBeGreaterThan(0)
    })
  })

  describe('isReservedUsername', () => {
    test('is case-insensitive', () => {
      expect(isReservedUsername('ADMIN')).toBe(true)
      expect(isReservedUsername('admin')).toBe(true)
    })

    test('a normal handle is not reserved', () => {
      expect(isReservedUsername('alexwise')).toBe(false)
    })
  })
})

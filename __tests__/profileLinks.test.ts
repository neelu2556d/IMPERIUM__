import {
  normalizeExternalUrl,
  linkHost,
  primaryLinkLabel,
  isInstagramUrl,
} from '@/lib/profiles/links'

describe('profile links (Arts District v2)', () => {
  describe('normalizeExternalUrl', () => {
    test('passes through a clean https url', () => {
      expect(normalizeExternalUrl('https://youtube.com/@me')).toBe('https://youtube.com/@me')
    })

    test('prepends https:// when scheme is missing', () => {
      expect(normalizeExternalUrl('youtube.com/@me')).toBe('https://youtube.com/@me')
    })

    test('empty / nullish → null', () => {
      expect(normalizeExternalUrl('')).toBeNull()
      expect(normalizeExternalUrl('   ')).toBeNull()
      expect(normalizeExternalUrl(null)).toBeNull()
      expect(normalizeExternalUrl(undefined)).toBeNull()
    })

    test('rejects javascript: and data: schemes (public-page XSS guard)', () => {
      expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull()
      expect(normalizeExternalUrl('data:text/html,<script>')).toBeNull()
      // a "scheme-less" javascript attempt becomes https://javascript:... which
      // has no dot in host → rejected
      expect(normalizeExternalUrl('javascript:void')).toBeNull()
    })

    test('rejects a bare host with no dot', () => {
      expect(normalizeExternalUrl('localhost')).toBeNull()
      expect(normalizeExternalUrl('foo')).toBeNull()
    })
  })

  describe('linkHost', () => {
    test('strips www', () => {
      expect(linkHost('https://www.alexwise.com/x')).toBe('alexwise.com')
    })
  })

  describe('primaryLinkLabel', () => {
    test('youtube → Watch on YouTube', () => {
      expect(primaryLinkLabel('https://youtube.com/@me')).toBe('Watch on YouTube')
      expect(primaryLinkLabel('https://youtu.be/abc')).toBe('Watch on YouTube')
    })

    test('unknown host → bare hostname', () => {
      expect(primaryLinkLabel('https://alexwise.com')).toBe('alexwise.com')
    })
  })

  describe('isInstagramUrl', () => {
    test('detects instagram', () => {
      expect(isInstagramUrl('https://instagram.com/me')).toBe(true)
      expect(isInstagramUrl('https://youtube.com/me')).toBe(false)
    })
  })
})

// The trust boundary for the host's gated AI verbs: a tile is first-party iff
// its html is BYTE-IDENTICAL to a compiled-in featured blob. These tests pin
// that property so a refactor can never quietly loosen it into a marker or a
// prefix match.

import { isFirstPartyAiHtml, FEATURED_TILES } from '@/lib/tiles/featured'

const studio = FEATURED_TILES.find((t) => t.id === 'studio')

describe('isFirstPartyAiHtml', () => {
  test('the exact studio featured blob is trusted', () => {
    expect(studio).toBeDefined()
    expect(studio!.envelope.html.length).toBeGreaterThan(0)
    expect(isFirstPartyAiHtml(studio!.envelope.html)).toBe(true)
  })

  test('a single changed byte is not trusted', () => {
    const html = studio!.envelope.html
    expect(isFirstPartyAiHtml(html + ' ')).toBe(false)
    expect(isFirstPartyAiHtml(html.replace('Studio', 'Studi0'))).toBe(false)
    expect(isFirstPartyAiHtml('<script>evil()</script>' + html)).toBe(false)
  })

  test('empty, null, and non-studio featured blobs are not trusted', () => {
    expect(isFirstPartyAiHtml('')).toBe(false)
    expect(isFirstPartyAiHtml(null)).toBe(false)
    expect(isFirstPartyAiHtml(undefined)).toBe(false)
    const water = FEATURED_TILES.find((t) => t.id === 'water-daily')
    expect(water).toBeDefined()
    expect(isFirstPartyAiHtml(water!.envelope.html)).toBe(false)
  })

  test('the studio blob still speaks the sealed bridge contract', () => {
    // The featured html is the canonical tile; if these markers vanish the
    // envelope/report contract broke somewhere upstream of trust.
    const html = studio!.envelope.html
    expect(html).toContain("source:'vitality-tile'")
    expect(html).toContain('videos_published')
    expect(html).toContain('studio:lookup')
    expect(html).toContain('studio:status')
    expect(html).toContain('studio:connect')
  })
})

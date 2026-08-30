/**
 * Guards the Arts District detail-modal preview config (DistrictDetailModal +
 * the `preview` field on lib/tiles/featured.ts): every featured tile ships a
 * complete, on-brand pitch and a showcase whose variant matches the tile's
 * REAL report kind, with an honest, well-formed sample week.
 */
import { FEATURED_TILES } from '@/lib/tiles/featured'

// Brand law: never an em or en dash anywhere in shipped copy.
const DASHES = /[—–]/

describe('Arts District: detail-modal previews', () => {
  test.each(FEATURED_TILES.map((t) => [t.id, t] as const))(
    '%s has a short, on-brand pitch',
    (_id, tile) => {
      const p = tile.preview
      expect(p.summary.trim().length).toBeGreaterThan(0)
      // ONE short line, never a paragraph
      expect(p.summary.length).toBeLessThanOrEqual(60)
      expect(p.summary).not.toMatch(DASHES)
      // exactly three small pill tags
      expect(p.tags).toHaveLength(3)
      for (const tag of p.tags) {
        expect(tag.trim().length).toBeGreaterThan(0)
        expect(tag.length).toBeLessThanOrEqual(16)
        expect(tag).not.toMatch(DASHES)
      }
    },
  )

  test.each(FEATURED_TILES.map((t) => [t.id, t] as const))(
    '%s showcase variant matches its report kind',
    (_id, tile) => {
      const v = tile.preview.showcase.variant
      if (tile.id === 'one-line-journal') {
        // the text journal never fakes a numeric chart
        expect(v).toBe('journal')
        return
      }
      const kind = tile.envelope.kind
      if (kind === 'done') expect(v).toBe('week')
      else if (kind === 'rating') expect(v).toBe('scale')
      else expect(v).toBe('ring')
    },
  )

  test.each(FEATURED_TILES.map((t) => [t.id, t] as const))(
    '%s sample week is honest and well-formed',
    (_id, tile) => {
      const s = tile.preview.showcase
      // a believable good week everywhere: streaks never beat the best
      expect(s.streak).toBeGreaterThan(0)
      expect(s.streak).toBeLessThanOrEqual(s.best)
      if (s.variant === 'ring') {
        expect(s.chart).toHaveLength(7)
        expect(Math.max(...s.chart)).toBeGreaterThan(0)
        expect(s.goal).toBeGreaterThan(0)
        // today's headline value never overshoots the goal (6/8, not 9/8)
        expect(s.value).toBeGreaterThan(0)
        expect(s.value).toBeLessThanOrEqual(s.goal)
        expect(s.sub.trim().length).toBeGreaterThan(0)
      } else if (s.variant === 'week') {
        expect(s.week).toHaveLength(7)
        for (const d of s.week) expect(d === 0 || d === 1).toBe(true)
        expect(s.kept.trim().length).toBeGreaterThan(0)
      } else if (s.variant === 'scale') {
        expect(s.outOf).toBeGreaterThan(1)
        expect(s.value).toBeGreaterThan(0)
        expect(s.value).toBeLessThanOrEqual(s.outOf)
        expect(s.sub.trim().length).toBeGreaterThan(0)
      } else {
        expect(s.lines.length).toBeGreaterThanOrEqual(2)
        expect(s.lines.length).toBeLessThanOrEqual(4)
        for (const l of s.lines) {
          expect(l.day.trim().length).toBeGreaterThan(0)
          expect(l.text.trim().length).toBeGreaterThan(0)
          expect(l.text).not.toMatch(DASHES)
        }
      }
    },
  )
})

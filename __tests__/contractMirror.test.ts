/**
 * THE CONTRACT MIRROR ALARM. The tile report contract (the platform's narrowest
 * waist: 7 kinds, 3 directions, normalizeKey canon, validateReport) exists as
 * TWO files because mcp/ cannot import across the package boundary:
 *   source: lib/tiles/reportContract.ts   (the dashboard, owner)
 *   mirror: mcp/src/tiles/reportContract.ts (vendored copy the MCP ships)
 * If they drift, the MCP accepts tiles the dashboard rejects - silently. The
 * mcp-side contractSync.test.ts compares against a git ref and SKIPS in clones
 * where that ref is missing; THIS test compares the two working-tree files
 * byte-for-byte on every `jest` run, so drift can never ride a green suite.
 *
 * The mirror is allowed exactly one extra thing: a leading comment banner
 * ("// MIRROR of ..."). Everything after it must equal the source exactly.
 */
import { readFileSync } from 'fs'
import path from 'path'

const SOURCE = path.join(process.cwd(), 'lib/tiles/reportContract.ts')
const MIRROR = path.join(process.cwd(), 'mcp/src/tiles/reportContract.ts')

describe('reportContract mirror (lib vs mcp)', () => {
  const source = readFileSync(SOURCE, 'utf8')
  const mirror = readFileSync(MIRROR, 'utf8')

  it('the mirror ends with the source, byte-for-byte', () => {
    expect(mirror.endsWith(source)).toBe(true)
  })

  it('everything the mirror adds is only the leading comment banner', () => {
    const banner = mirror.slice(0, mirror.length - source.length)
    expect(banner.length).toBeLessThan(600) // a banner, not smuggled logic
    for (const line of banner.split('\n')) {
      expect(line === '' || line.startsWith('//')).toBe(true)
    }
    expect(banner).toContain('MIRROR')
  })

  it('both copies carry the calory canonical family (the canon that started this alarm)', () => {
    for (const text of [source, mirror]) {
      expect(text).toContain("calory: 'calories'")
      expect(text).toContain("calorie: 'calories'")
      expect(text).toContain("kcal: 'calories'")
    }
  })
})

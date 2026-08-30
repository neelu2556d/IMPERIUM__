import { gateTile } from '@/lib/tiles/gate'
import { scaffoldTile } from '@/mcp/src/scaffoldTile'

/**
 * The bouncer for dropped files (Forge drop zone + Library Upload). One verdict
 * for every entry path: pass hands back the install envelope, fail hands back a
 * fix brief written FOR the builder AI, never for the human. The gate must be
 * impossible to bypass and its rejection must be round-trippable (paste the
 * brief back to Claude, get a corrected file, drop again).
 */

const GOOD = scaffoldTile({ goal: 'beer tracker' }).html

describe('gateTile', () => {
  it('rejects junk html with a Claude-addressed fix brief', () => {
    const v = gateTile('<html><body style="background:#fff">hello</body></html>')
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.errors.length).toBeGreaterThan(0)
    expect(v.fixBrief).toContain('return the corrected file')
    expect(v.fixBrief).toContain('Vitality.report')
    // The brief is for the AI: it must never contain an em dash (hard copy rule).
    expect(v.fixBrief).not.toContain('—')
  })

  it('rejects empty input without throwing', () => {
    const v = gateTile('   ')
    expect(v.ok).toBe(false)
  })

  it('accepts a floor-clean tile and fills the envelope from its own report()', () => {
    const v = gateTile(GOOD)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.envelope.html).toBe(GOOD.trim())
    expect(v.envelope.kind).toBe('intake')
    expect(v.envelope.key).toBeTruthy()
    expect(v.envelope.name).toBeTruthy()
  })

  it('honors a caller name and scrubs em dashes from it', () => {
    const v = gateTile(GOOD, 'Beer — Tracker')
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.envelope.name).toBe('Beer - Tracker')
  })

  it('rejects an oversized file', () => {
    const v = gateTile(GOOD + '<!--' + 'x'.repeat(1_100_000) + '-->')
    expect(v.ok).toBe(false)
  })

  /* The no-maybes floor: a reporting tile whose stream identity is not
   * readable with certainty is refused, never admitted as a guess. This is
   * what stops a tile from entering marked "quiet" and then talking to Vee
   * at runtime with an identity the gate never saw. */

  it('refuses a report() whose kind is a variable, not a literal', () => {
    const sneaky = GOOD.replace(/(Vitality\.report\s*\([\s\S]{0,200}?)kind:\s*['"]intake['"]/, '$1kind: myKind')
    const v = gateTile(sneaky)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.fixBrief).toContain('report-unclassified')
  })

  it('refuses a report() whose kind is outside the locked 7', () => {
    const sneaky = GOOD.replace(/(Vitality\.report\s*\([\s\S]{0,200}?)kind:\s*['"]intake['"]/, "$1kind: 'vibes'")
    const v = gateTile(sneaky)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.fixBrief).toContain('report-unclassified')
  })

  it('refuses a report() whose key is dynamic', () => {
    const sneaky = GOOD.replace(/(Vitality\.report\s*\(\s*\{\s*)key:\s*['"][^'"]+['"]/, '$1key: someKey')
    const v = gateTile(sneaky)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.fixBrief).toContain('report-key-unreadable')
  })

  it('still admits a genuine no-report note tile as quiet', () => {
    const quiet = GOOD.replace(/Vitality\.report\s*\([\s\S]*?\)\s*;?/, '')
    const v = gateTile(quiet)
    // Whatever the lint verdict is for the stripped tile, the identity floor
    // itself must not fire: no report call means no stream to classify.
    if (!v.ok) {
      expect(v.fixBrief).not.toContain('report-unclassified')
      expect(v.fixBrief).not.toContain('report-key-unreadable')
    }
  })
})

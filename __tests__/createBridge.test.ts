/**
 * The community-tile bridge honesty contract (the BUILD_PROMPT users paste into
 * their own Claude). The host (useTileHost) replies save:error / report:error on a
 * failed write and can drop a load:result on a flaky network; a tile built from the
 * official prompt must HEAR those replies and stay honest:
 *   - an error reply surfaces a calm amber note inside the tile (never a lie of success)
 *   - load() re-asks once at 3s and falls back to null at ~6s so a dropped reply
 *     never leaves the tile blank
 *   - the waiter stays alive after the fallback: a LATE reply carrying saved data,
 *     arriving before any save, reloads the tile so an empty boot can never
 *     silently overwrite stored history on the next save
 * These pins trip if the prompt's verbatim bridge ever loses that wiring.
 */
import { BUILD_PROMPT } from '@/app/app/create/CreateTile'

describe('BUILD_PROMPT bridge honesty', () => {
  it('listens for the host save:error reply and surfaces a calm note', () => {
    expect(BUILD_PROMPT).toContain("m.type==='save:error'")
    expect(BUILD_PROMPT).toContain('That save did not stick')
  })

  it('listens for the host report:error reply and surfaces a calm note', () => {
    expect(BUILD_PROMPT).toContain("m.type==='report:error'")
    expect(BUILD_PROMPT).toContain('That log did not land')
  })

  it('the note is amber (caution law: amber, never red)', () => {
    expect(BUILD_PROMPT).toContain('#F59E0B')
    expect(BUILD_PROMPT).not.toMatch(/#(ff0000|f00|dc2626|ef4444)/i)
  })

  it('load() retries once, then falls back so a dropped reply never leaves the tile blank', () => {
    expect(BUILD_PROMPT).toContain('setInterval')
    expect(BUILD_PROMPT).toContain('3000')
    // the fallback resolves null; the rules tell the builder to treat null as empty state
    expect(BUILD_PROMPT).toContain('res(null)')
    expect(BUILD_PROMPT).toContain('fall back to your empty state')
  })

  it('a late load:result with saved data reloads the tile before a save can overwrite it', () => {
    // the fallback waiter stays registered and guards stored history
    expect(BUILD_PROMPT).toContain('if(d!=null&&!Vitality._sv)location.reload()')
    // save marks the tile dirty so a late reply never stomps fresh input
    expect(BUILD_PROMPT).toContain('save:function(d){Vitality._sv=true;')
  })

  it('keeps the sealed-tile contract wording intact (bridge verbs + report shape)', () => {
    for (const piece of [
      "type:'save'", "type:'load'", "type:'report'",
      'Vitality.save(data)', 'Vitality.load()', 'Vitality.report(stream)',
      'intake, count, duration, rating, measure, money, done',
    ]) expect(BUILD_PROMPT).toContain(piece)
  })

  it('carries no em dash and no emoji', () => {
    expect(BUILD_PROMPT).not.toMatch(/—/)
    expect(BUILD_PROMPT).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

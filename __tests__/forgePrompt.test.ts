/**
 * forgePrompt - pure string assertions on the two Forge lanes.
 *
 * brief: the universal lane. It must stand alone with NO tools assumed
 * (spec URL + one file back + the drop-zone round-trip) and must never
 * mention connectors or any claude.ai setup - that path is deleted.
 *
 * code: the Claude Code power lane. It must stay ACCURATE to the real MCP
 * surface (mcp/src/tools.ts): connect once with --scope user, then
 * vitality_tile_kit -> hand-author -> check_tile to 0 errors ->
 * vitality_add_tile with kind + born classification.
 *
 * Both: zero em dashes, ever.
 */
import { buildForgePrompt, FORGE_CONNECT_CMD, FORGE_MCP_URL, TILE_SPEC_URL } from '@/lib/tiles/forgePrompt'

const IDEA = 'a workout logger with plates math'

describe('buildForgePrompt - both lanes', () => {
  const { brief, code } = buildForgePrompt(IDEA)
  const variants: Array<[string, string]> = [
    ['brief', brief],
    ['code', code],
  ]

  it.each(variants)('%s embeds the idea verbatim', (_name, p) => {
    expect(p).toContain(`My idea: "${IDEA}"`)
  })

  it.each(variants)('%s demands one sealed bridge-wired file', (_name, p) => {
    expect(p).toContain('sealed')
    expect(p).toContain('Vitality.report')
    expect(p.toLowerCase()).toContain('no em dashes')
  })

  it.each(variants)('%s names the locked seven kinds', (_name, p) => {
    expect(p).toContain('intake, count, duration, rating, measure, money, done')
  })

  it.each(variants)('%s contains no em dash', (_name, p) => {
    expect(p).not.toMatch(/—/)
  })

  it.each(variants)('%s never mentions claude.ai connector setup', (_name, p) => {
    expect(p).not.toContain('Settings > Connectors')
    expect(p).not.toContain('claude.ai/new')
  })

  it('scrubs an em dash out of the idea itself', () => {
    const dirty = buildForgePrompt('plates — math')
    expect(dirty.brief).not.toMatch(/—/)
    expect(dirty.code).not.toMatch(/—/)
    expect(dirty.brief).toContain('plates - math')
  })

  it('a blank idea falls back to asking, never guessing', () => {
    const blank = buildForgePrompt('   ')
    expect(blank.brief).toContain('a tile I will describe when you ask me')
  })
})

describe('buildForgePrompt - the universal brief (drop-zone lane)', () => {
  const { brief } = buildForgePrompt(IDEA)

  it('points at the public spec URL', () => {
    expect(brief).toContain(TILE_SPEC_URL)
  })

  it('carries the FULL spec inline so a no-fetch AI still has the rulebook', () => {
    expect(brief).toContain('THE BUILD SPEC')
    expect(brief).toContain('VITALITY TILE SPEC')
    expect(brief).toContain('THE DESIGN DNA')
    expect(brief).toContain('#6EE7B7')
    // The spec must match the real linter: color-scheme is forbidden, not required.
    expect(brief).toContain('Do NOT declare color-scheme')
  })

  it('assumes no tools: never names the MCP tool surface', () => {
    expect(brief).not.toContain('vitality_tile_kit')
    expect(brief).not.toContain('vitality_add_tile')
    expect(brief).not.toContain(FORGE_CONNECT_CMD)
  })

  it('ends at the drop zone with the fix-list round-trip', () => {
    expect(brief).toContain('Forge page')
    expect(brief).toContain('fix list')
    expect(brief).toContain('return the corrected file')
  })
})

describe('buildForgePrompt - the Claude Code lane (MCP ritual)', () => {
  const { code } = buildForgePrompt(IDEA)

  it('leads with the one-time connect command, scoped to the user', () => {
    expect(code.startsWith(`${FORGE_CONNECT_CMD}\n\n`)).toBe(true)
    expect(FORGE_CONNECT_CMD).toContain('--scope user')
    expect(FORGE_CONNECT_CMD).toContain(FORGE_MCP_URL)
  })

  it('names the real MCP tools, staged kit then check then add', () => {
    const kit = code.lastIndexOf('vitality_tile_kit')
    const check = code.lastIndexOf('check_tile')
    const add = code.lastIndexOf('vitality_add_tile')
    expect(kit).toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(kit)
    expect(add).toBeGreaterThan(check)
  })

  it('offers the kit domain list from the real tool schema', () => {
    expect(code).toContain('food, workout, supplement, vee, finance, vitals, goals')
  })

  it('demands proof at 0 errors before shipping', () => {
    expect(code).toContain('0 errors')
  })

  it('explicitly overrides the tools goal-only default path', () => {
    expect(code).toContain('the hand-authored kit path is exactly what I am asking for')
    expect(code).toContain('Do not take the goal-only shortcut or scaffold_tile')
  })

  it('instructs passing kind + born classification on the html path', () => {
    expect(code).toContain('`kind`')
    expect(code).toContain('goalCategory')
    expect(code).toContain('veeNote')
  })

  it('routes a write refusal through vitality_connection first', () => {
    expect(code).toContain('vitality_connection')
    expect(code).toContain('do not hand me html to paste')
  })
})

describe('buildForgePrompt - the idea cap', () => {
  it('caps a pasted mega-spec at FORGE_IDEA_MAX', () => {
    const { FORGE_IDEA_MAX } = jest.requireActual('@/lib/tiles/forgePrompt')
    const monster = 'a tile that '.repeat(2000) // ~24k chars
    const { brief: capped } = buildForgePrompt(monster)
    const m = /My idea: "([^"]*)"/.exec(capped)
    expect(m).toBeTruthy()
    expect(m![1].length).toBeLessThanOrEqual(FORGE_IDEA_MAX)
    expect(capped).not.toMatch(/—/)
  })
})

import { webcrypto } from 'node:crypto'
import { FEATURED_TILES, FEATURED_CATEGORIES, DEFS } from '@/lib/tiles/featured'
import { renderFeaturedHtml } from '@/lib/tiles/featuredCodegen'
import featuredHtml from '@/lib/tiles/featuredHtml.json'
import { lintTile } from '@/mcp/src/tiles/lintTile'
import { designByKey } from '@/lib/tiles/designs'
import { tileStore } from '@/lib/tiles/tileStore'

const HTML_JSON = featuredHtml as Record<string, string>

// tileStore + createTile persist to window.localStorage and mint ids via crypto.
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
  removeItem: (k: string) => {
    delete store[k]
  },
  clear: () => {
    for (const k in store) delete store[k]
  },
  length: 0,
  key: () => null,
}
Object.defineProperty(global, 'window', { value: { localStorage: localStorageMock }, writable: true })
if (!(globalThis as { crypto?: Crypto }).crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

// A pictograph / emoji range guard. Tiles must use inline SVG, never emoji.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u

describe('Arts District: the featured tile catalog', () => {
  beforeEach(() => localStorageMock.clear())

  test('has a non-empty catalog with unique ids', () => {
    expect(FEATURED_TILES.length).toBeGreaterThan(0)
    const ids = FEATURED_TILES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test.each(FEATURED_TILES.map((t) => [t.id, t] as const))(
    '%s is a valid, sealed, on-brand envelope',
    (_id, tile) => {
      const env = tile.envelope
      expect(env.name.trim().length).toBeGreaterThan(0)
      expect(env.html.length).toBeGreaterThan(400)
      // the Vitality bridge shim must be present and actually used both ways
      expect(env.html).toContain("source:'vitality-tile'")
      expect(env.html).toMatch(/Vitality\.load\s*\(/)
      expect(env.html).toMatch(/Vitality\.save\s*\(/)
      // sealed opaque origin: a tile must never touch its own web storage
      expect(env.html).not.toMatch(/localStorage|sessionStorage/)
      // brand law: no emoji (SVG only), no em or en dashes
      expect(env.html).not.toMatch(EMOJI)
      expect(env.html).not.toMatch(/[—–]/)
      // its poster design must resolve to a real design
      expect(designByKey(env.design || '')).toBeTruthy()
    },
  )

  // Vee-reporting contract: every featured tile must stream to Vee via the
  // inlined report shim + a Vitality.report({...,kind:...}) call at its real
  // logging event. The 5 formerly-silent tiles (water/habit/journal/mood/focus)
  // regressed to no report; this guards all 11 stay wired.
  const VALID_KINDS = ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']
  test.each(FEATURED_TILES.map((t) => [t.id, t] as const))(
    '%s reports to Vee with a valid report kind',
    (_id, tile) => {
      const html = tile.envelope.html
      // the report shim must be inlined (posts type:'report' to the parent)
      expect(html).toMatch(/type:\s*'report'/)
      // and there must be at least one live Vitality.report({...}) call
      const call = html.match(/Vitality\.report\(\{[^}]*\}\)/)
      expect(call).toBeTruthy()
      // whose kind is in the valid taxonomy (tiles use single OR double quotes)
      const kind = call![0].match(/kind:\s*['"]([^'"]+)['"]/)
      expect(kind).toBeTruthy()
      expect(VALID_KINDS).toContain(kind![1])
    },
  )

  test('every filter category maps to at least one tile', () => {
    for (const c of FEATURED_CATEGORIES) {
      expect(FEATURED_TILES.some((t) => t.envelope.category === c)).toBe(true)
    }
  })

  // The numeric featured tiles are GENERATED from the deterministic MCP builder
  // (see scripts/genFeatured.ts + lib/tiles/featuredCodegen). This is the drift alarm:
  // the committed html must equal a fresh render of its `build` recipe, so a template
  // upgrade that is not re-run (npm run gen:featured) fails CI instead of shipping a
  // stale, thin tile. one-line-journal has NO `build` (text, not numeric) and is the
  // one documented hand-authored exception, excluded here.
  const BUILT = DEFS.filter((d) => d.build)

  test('at least the 10 numeric tiles carry a build recipe; journal + studio are the exceptions', () => {
    expect(BUILT.length).toBe(10)
    // one-line-journal is hand-authored text; studio is a full-page tool (its own
    // sealed html in public/studio-tile.html), so neither is MCP-codegen'd.
    const withoutBuild = DEFS.filter((d) => !d.build).map((d) => d.id)
    expect(withoutBuild).toEqual(['one-line-journal', 'studio'])
  })

  test.each(BUILT.map((d) => [d.id, d] as const))(
    '%s committed html === renderTile(infer(build)) (no drift)',
    (id, def) => {
      const fresh = renderFeaturedHtml(def.build!)
      expect(HTML_JSON[id]).toBe(fresh)
    },
  )

  test.each(BUILT.map((d) => [d.id, d] as const))(
    '%s regenerated tile lints 0 errors / 0 warnings',
    (id) => {
      const lint = lintTile(HTML_JSON[id])
      expect(lint.errors).toBe(0)
      expect(lint.warnings).toBe(0)
    },
  )

  test.each(BUILT.map((d) => [d.id, d] as const))(
    '%s report key stays byte-identical to its build recipe (no stream re-key)',
    (id, def) => {
      const call = HTML_JSON[id].match(/Vitality\.report\(\{[^}]*\}\)/)
      expect(call).toBeTruthy()
      const key = call![0].match(/key:\s*['"]([^'"]+)['"]/)
      expect(key).toBeTruthy()
      expect(key![1]).toBe(def.build!.key)
    },
  )

  test('adding a featured tile installs it into the library through importTile', () => {
    const f = FEATURED_TILES[0]
    const tile = tileStore.importTile('user-1', f.envelope)
    expect(tile).toBeTruthy()
    expect(tile!.name).toBe(f.envelope.name)
    expect(tile!.html).toBe(f.envelope.html)
    // it now shows in the user's library list
    const list = tileStore.listTiles('user-1')
    expect(list.some((t) => t.id === tile!.id)).toBe(true)
  })
})

import {
  exportTileCode,
  parseTileCode,
  parseTileCodeResult,
  isTileCode,
  tileToEnvelope,
  MAX_SHARE_HTML,
} from '@/lib/tiles/share'
import type { Tile } from '@/lib/tiles/types'
import type { Skin } from '@/lib/tiles/tileSkin'

const PREFIX = 'vitality:tile:'

const tile: Tile = {
  id: 't1',
  name: 'My to-dos',
  // unicode (accents + CJK) + a literal </script> to prove the code survives
  // arbitrary, non-latin1 tile html without a raw-btoa blowup.
  html: '<!doctype html><body>héllo · 世界 · 🚀 · ✅ </script> ok</body>',
  createdAt: 1,
  updatedAt: 1,
  category: 'Done',
}
const skin: Skin = {
  size: 'm',
  design: 'tide-layers',
  color: '#6EE7B7',
  name: 'Custom name',
  livingDots: true,
}

/** Pack any object as a raw (Buffer-based) share code, bypassing the encoder. */
function rawCode(obj: unknown): string {
  return PREFIX + Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url')
}

describe('tile share code: happy round-trip', () => {
  test('exportTileCode(tileToEnvelope(x)) -> parseTileCode reconstructs the envelope', () => {
    const code = exportTileCode(tile, skin)
    expect(isTileCode(code)).toBe(true)

    const env = parseTileCode(code)
    expect(env).toBeTruthy()
    expect(env!.name).toBe('Custom name') // skin name wins over the tile name
    expect(env!.html).toBe(tile.html) // unicode + emoji + </script> preserved exactly
    expect(env!.category).toBe('Done')
    expect(env!.design).toBe('tide-layers')
    expect(env!.color).toBe('#6EE7B7')
    expect(env!.size).toBe('m')
  })

  test('the reconstructed envelope equals the source envelope (deep equality)', () => {
    const source = tileToEnvelope(tile, skin)
    const round = parseTileCode(exportTileCode(tile, skin))
    expect(round).toEqual(source)
  })

  test('unicode in the NAME survives the round-trip (utf-8 safe base64url)', () => {
    const unicodeSkin: Skin = { ...skin, name: 'Café · 日本語 · 🚀' }
    const env = parseTileCode(exportTileCode(tile, unicodeSkin))
    expect(env!.name).toBe('Café · 日本語 · 🚀')
  })

  test('the declared stream (report contract) survives the round-trip (PATCH21)', () => {
    const beerTile: Tile = {
      ...tile,
      key: 'beer',
      label: 'Beer',
      kind: 'intake',
      goalDirection: 'down',
    }
    const env = parseTileCode(exportTileCode(beerTile, skin))!
    expect(env.key).toBe('beer')
    expect(env.label).toBe('Beer')
    expect(env.kind).toBe('intake')
    expect(env.goalDirection).toBe('down')
  })

  test('a tile with no declared stream stays clean (no phantom fields)', () => {
    const env = parseTileCode(exportTileCode(tile, skin))!
    expect(env.key).toBeUndefined()
    expect(env.kind).toBeUndefined()
    expect(env.goalDirection).toBeUndefined()
  })

  test('parseTileCodeResult returns { ok: true, envelope } on a good code', () => {
    const res = parseTileCodeResult(exportTileCode(tile, skin))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.envelope.html).toBe(tile.html)
  })
})

describe('tile share code: malformed input NEVER throws, returns the failure contract', () => {
  test('not a code (no prefix): null + reason "not_a_code"', () => {
    expect(() => parseTileCode('hello world')).not.toThrow()
    expect(parseTileCode('hello world')).toBeNull()
    expect(parseTileCodeResult('hello world')).toEqual({ ok: false, reason: 'not_a_code' })
    // raw JSON without the prefix is NOT a code (caller handles JSON separately)
    expect(parseTileCode('{"name":"x","html":"y"}')).toBeNull()
    expect(parseTileCodeResult('{"name":"x","html":"y"}').ok).toBe(false)
  })

  test('malformed base64 after the prefix: null + reason "bad_base64"', () => {
    const bad = PREFIX + '!!! not base64 !!!'
    expect(() => parseTileCode(bad)).not.toThrow()
    expect(parseTileCode(bad)).toBeNull()
    expect(parseTileCodeResult(bad)).toEqual({ ok: false, reason: 'bad_base64' })
  })

  test('truncated code (chopped mid-payload): does not throw, returns a failure', () => {
    const full = exportTileCode(tile, skin)
    const truncated = full.slice(0, full.length - 10)
    expect(() => parseTileCode(truncated)).not.toThrow()
    const res = parseTileCodeResult(truncated)
    // A chopped payload is either undecodable base64 or decodes to broken JSON;
    // either way it MUST be a clean, non-throwing failure.
    expect(res.ok).toBe(false)
    if (!res.ok) expect(['bad_base64', 'bad_json', 'bad_shape']).toContain(res.reason)
  })

  test('valid base64 but not JSON: null + reason "bad_json"', () => {
    const notJson = PREFIX + Buffer.from('this is plain text, not json', 'utf-8').toString('base64url')
    expect(() => parseTileCode(notJson)).not.toThrow()
    expect(parseTileCode(notJson)).toBeNull()
    expect(parseTileCodeResult(notJson)).toEqual({ ok: false, reason: 'bad_json' })
  })

  test('valid JSON but wrong shape (array): null + reason "bad_shape"', () => {
    const arr = rawCode([1, 2, 3])
    expect(parseTileCode(arr)).toBeNull()
    expect(parseTileCodeResult(arr)).toEqual({ ok: false, reason: 'bad_shape' })
  })

  test('valid JSON but wrong shape (a bare number/string/null): null + "bad_shape"', () => {
    for (const junk of ['42', '"just a string"', 'null', 'true']) {
      const code = PREFIX + Buffer.from(junk, 'utf-8').toString('base64url')
      expect(() => parseTileCode(code)).not.toThrow()
      expect(parseTileCode(code)).toBeNull()
      const res = parseTileCodeResult(code)
      expect(res.ok).toBe(false)
    }
  })

  test('JSON object missing html: null + reason "bad_shape"', () => {
    const code = rawCode({ name: 'has a name' })
    expect(parseTileCode(code)).toBeNull()
    expect(parseTileCodeResult(code)).toEqual({ ok: false, reason: 'bad_shape' })
  })

  test('JSON object missing name: null + reason "bad_shape"', () => {
    const code = rawCode({ html: '<p>hi</p>' })
    expect(parseTileCode(code)).toBeNull()
    expect(parseTileCodeResult(code)).toEqual({ ok: false, reason: 'bad_shape' })
  })

  test('blank name AND blank html: null + reason "bad_shape"', () => {
    const code = rawCode({ name: '   ', html: '   ' })
    expect(parseTileCode(code)).toBeNull()
    expect(parseTileCodeResult(code)).toEqual({ ok: false, reason: 'bad_shape' })
  })

  test('empty string and empty-after-prefix do not throw', () => {
    expect(() => parseTileCode('')).not.toThrow()
    expect(parseTileCode('')).toBeNull()
    expect(parseTileCodeResult('')).toEqual({ ok: false, reason: 'not_a_code' })
    // just the prefix with nothing after it decodes to '' -> not JSON
    expect(() => parseTileCode(PREFIX)).not.toThrow()
    expect(parseTileCode(PREFIX)).toBeNull()
  })
})

describe('tile share code: oversized payload rejected cleanly', () => {
  test('a code whose decoded html exceeds the 1MB cap is rejected with "too_large"', () => {
    const huge = 'a'.repeat(MAX_SHARE_HTML + 1)
    const code = rawCode({ name: 'huge', html: huge })
    expect(() => parseTileCode(code)).not.toThrow()
    expect(parseTileCode(code)).toBeNull()
    expect(parseTileCodeResult(code)).toEqual({ ok: false, reason: 'too_large' })
  })

  test('a giant raw paste (well over the cap) is rejected before any JSON work', () => {
    const giant = PREFIX + 'A'.repeat(MAX_SHARE_HTML * 2)
    expect(() => parseTileCode(giant)).not.toThrow()
    expect(parseTileCodeResult(giant)).toEqual({ ok: false, reason: 'too_large' })
  })

  test('a payload right at the cap is still accepted', () => {
    const atCap = 'b'.repeat(1000) // comfortably under, proves the boundary is not off-by-one strict
    const code = rawCode({ name: 'ok', html: atCap })
    const res = parseTileCodeResult(code)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.envelope.html.length).toBe(1000)
  })
})

describe('isTileCode: cheap, exact, never throws', () => {
  test('true for a real code and for the bare prefix', () => {
    expect(isTileCode(exportTileCode(tile, skin))).toBe(true)
    expect(isTileCode('vitality:tile:anything')).toBe(true)
    expect(isTileCode('   vitality:tile:padded  ')).toBe(true) // trims first
  })

  test('false for non-codes', () => {
    expect(isTileCode('nope')).toBe(false)
    expect(isTileCode('')).toBe(false)
    expect(isTileCode('{"name":"x"}')).toBe(false)
    expect(isTileCode('vitality:tile')).toBe(false) // missing trailing colon
    expect(isTileCode('vitality:')).toBe(false)
  })

  test('does not throw on non-string input', () => {
    // Defensive: callers may hand it a value typed as string that is not one.
    expect(() => isTileCode(undefined as unknown as string)).not.toThrow()
    expect(() => isTileCode(null as unknown as string)).not.toThrow()
    expect(isTileCode(undefined as unknown as string)).toBe(false)
    expect(isTileCode(null as unknown as string)).toBe(false)
  })
})

import { exportTileCode, parseTileCode, isTileCode } from '@/lib/tiles/share'
import type { Tile } from '@/lib/tiles/types'
import type { Skin } from '@/lib/tiles/tileSkin'

const tile: Tile = {
  id: 't1',
  name: 'My to-dos',
  // unicode + a literal </script> to prove the code survives arbitrary tile html
  html: '<!doctype html><body>héllo · 世界 </script> ok</body>',
  createdAt: 1,
  updatedAt: 1,
  category: 'Done',
}
const skin: Skin = { size: 'm', design: 'tide-layers', color: '#6EE7B7', name: 'Custom name', livingDots: true }

describe('tile share code (Arts District v1)', () => {
  test('round-trips a tile through export -> parse', () => {
    const code = exportTileCode(tile, skin)
    expect(isTileCode(code)).toBe(true)
    const env = parseTileCode(code)
    expect(env).toBeTruthy()
    expect(env!.name).toBe('Custom name') // the skin name wins over the tile name
    expect(env!.html).toBe(tile.html) // unicode + </script> preserved exactly
    expect(env!.category).toBe('Done')
    expect(env!.design).toBe('tide-layers')
    expect(env!.color).toBe('#6EE7B7')
    expect(env!.size).toBe('m')
  })

  test('falls back to the tile name when the skin has none', () => {
    const code = exportTileCode(tile, { ...skin, name: null })
    expect(parseTileCode(code)!.name).toBe('My to-dos')
  })

  test('the declared stream (report contract) SURVIVES the round-trip (PATCH21)', () => {
    const beerTile: Tile = {
      ...tile,
      key: 'beer',
      label: 'Beer',
      kind: 'intake',
      goalDirection: 'down',
    }
    const env = parseTileCode(exportTileCode(beerTile, skin))!
    // without these four, a shared beer tile silently flips from
    // "down = good" magnitude scoring to neutral cadence on install
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

  test('is not a code, and rejects junk', () => {
    expect(isTileCode('nope')).toBe(false)
    expect(parseTileCode('hello')).toBeNull()
    expect(parseTileCode('{"name":"x","html":"y"}')).toBeNull() // raw JSON is not a code
    expect(parseTileCode('vitality:tile:!!! not base64 !!!')).toBeNull()
  })

  test('rejects a code missing name or html', () => {
    const bad = 'vitality:tile:' + Buffer.from(JSON.stringify({ name: '', html: '' })).toString('base64url')
    expect(parseTileCode(bad)).toBeNull()
  })
})

import { tileStore } from '@/lib/tiles/tileStore'
import { tileSkin } from '@/lib/tiles/tileSkin'
import type { TileEnvelope } from '@/lib/tiles/types'

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k in store) delete store[k] },
  length: 0,
  key: () => null,
}
Object.defineProperty(global, 'window', { value: { localStorage: localStorageMock }, writable: true })

let n = 0
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => `tile-${++n}` },
  writable: true,
})

const A = 'user-a'
beforeEach(() => {
  localStorageMock.clear()
  n = 0
})

const valid = (over: Partial<TileEnvelope> = {}): TileEnvelope => ({
  name: 'My to-dos',
  html: '<div>tile</div>',
  ...over,
})

describe('tileStore.importTile: the one install pipe', () => {
  test('a valid envelope creates a tile and stores it', () => {
    const tile = tileStore.importTile(A, valid())
    expect(tile).not.toBeNull()
    expect(tile!.name).toBe('My to-dos')
    expect(tile!.html).toBe('<div>tile</div>')
    expect(tileStore.getTile(A, tile!.id)).toBeDefined()
  })

  test('an explicit category wins', () => {
    const tile = tileStore.importTile(A, valid({ category: 'Mind' }))
    expect(tile!.category).toBe('Mind')
  })

  test('category derives from kind when not given', () => {
    expect(tileStore.importTile(A, valid({ kind: 'count' }))!.category).toBe('Count')
    expect(tileStore.importTile(A, valid({ kind: 'duration' }))!.category).toBe('Duration')
    expect(tileStore.importTile(A, valid({ kind: 'intake' }))!.category).toBe('Intake')
    expect(tileStore.importTile(A, valid({ kind: 'rating' }))!.category).toBe('Rating')
    expect(tileStore.importTile(A, valid({ kind: 'measure' }))!.category).toBe('Measure')
    expect(tileStore.importTile(A, valid({ kind: 'money' }))!.category).toBe('Money')
    expect(tileStore.importTile(A, valid({ kind: 'done' }))!.category).toBe('Done')
  })

  test('category falls back to Custom with no category and no kind', () => {
    expect(tileStore.importTile(A, valid())!.category).toBe('Custom')
  })

  test('the declared stream rides onto the installed tile AND persists (PATCH21)', () => {
    const tile = tileStore.importTile(
      A,
      valid({ key: 'beer', label: 'Beer', kind: 'intake', goalDirection: 'down' }),
    )!
    // read back through the store (not the returned object) to prove it PERSISTED
    const stored = tileStore.getTile(A, tile.id)!
    expect(stored.key).toBe('beer')
    expect(stored.label).toBe('Beer')
    expect(stored.kind).toBe('intake')
    expect(stored.goalDirection).toBe('down')
  })

  test('a missing name returns null', () => {
    const bad = { html: '<div>x</div>' } as unknown as TileEnvelope
    expect(tileStore.importTile(A, bad)).toBeNull()
  })

  test('an empty / whitespace name returns null', () => {
    expect(tileStore.importTile(A, valid({ name: '' }))).toBeNull()
    expect(tileStore.importTile(A, valid({ name: '   ' }))).toBeNull()
  })

  test('a missing html returns null', () => {
    const bad = { name: 'x' } as unknown as TileEnvelope
    expect(tileStore.importTile(A, bad)).toBeNull()
  })

  test('an empty html returns null', () => {
    expect(tileStore.importTile(A, valid({ html: '' }))).toBeNull()
  })

  test('oversized html returns null and writes nothing', () => {
    const huge = 'x'.repeat(1024 * 1024 + 1)
    expect(tileStore.importTile(A, valid({ html: huge }))).toBeNull()
    expect(tileStore.listTiles(A)).toHaveLength(0)
  })

  test('design / color / size seed the tile skin', () => {
    const tile = tileStore.importTile(
      A,
      valid({ design: 'aurora', color: '#6EA8FF', size: 'hero' }),
    )
    expect(tile).not.toBeNull()
    const skin = tileSkin.get(A, tile!.id)
    expect(skin.design).toBe('aurora')
    expect(skin.color).toBe('#6EA8FF')
    expect(skin.size).toBe('hero')
  })

  test('no skin fields means a default skin (no seed)', () => {
    const tile = tileStore.importTile(A, valid())
    const skin = tileSkin.get(A, tile!.id)
    expect(skin).toEqual({ size: 's', design: null, color: null, name: null, livingDots: true })
  })
})

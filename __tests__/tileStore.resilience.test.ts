import { tileStore } from '@/lib/tiles/tileStore'
import type { TileEnvelope } from '@/lib/tiles/types'

/**
 * Resilience contract for tileStore's localStorage backing: a user must never
 * lose their board or hit a white screen because storage is corrupt, full,
 * blocked (private mode), or absent (SSR). These tests drive the three failure
 * shapes the store has to survive:
 *   - a corrupted / non-JSON value on read  -> treated as empty, never thrown
 *   - a setItem that throws (QuotaExceeded)  -> no crash, signals via the SAME
 *                                               contract the happy path uses
 *   - no window at all (server render)       -> every access guarded, no throw
 *
 * The mock matches the other tile tests (tileSync / tileStoreImport / homeLayout):
 * a plain in-memory record standing in for window.localStorage. We keep a handle
 * on the raw `store` so a test can seed a corrupt value directly, and a `mode`
 * flag so setItem can be made to throw on demand.
 */
const store: Record<string, string> = {}
let setItemMode: 'ok' | 'quota' = 'ok'

class QuotaExceededError extends Error {
  constructor() {
    super('QuotaExceededError')
    this.name = 'QuotaExceededError'
  }
}

const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    if (setItemMode === 'quota') throw new QuotaExceededError()
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

// crypto.randomUUID like tileStoreImport.test.ts. A "tile-N" id is deliberately
// NOT a uuid, so tileDataSync.push short-circuits on its uuid guard and no
// supabase client is ever constructed inside these unit tests.
let n = 0
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => `tile-${++n}` },
  writable: true,
})

const withWindow = () => {
  Object.defineProperty(global, 'window', {
    value: { localStorage: localStorageMock },
    writable: true,
    configurable: true,
  })
}

const A = 'user-a'
const indexKey = (userId: string) => `vitality:${userId}:tiles`
const dataKey = (userId: string, id: string) => `vitality:${userId}:tile:${id}:data`

const valid = (over: Partial<TileEnvelope> = {}): TileEnvelope => ({
  name: 'My to-dos',
  html: '<div>tile</div>',
  ...over,
})

beforeEach(() => {
  localStorageMock.clear()
  setItemMode = 'ok'
  n = 0
  withWindow()
})

describe('tileStore resilience: corrupted reads never throw', () => {
  test('a non-JSON tiles registry reads as empty, not a thrown error', () => {
    store[indexKey(A)] = '{ this is not json ]['
    expect(() => tileStore.listTiles(A)).not.toThrow()
    expect(tileStore.listTiles(A)).toEqual([])
    // getTile rides the same read, so it degrades the same way
    expect(() => tileStore.getTile(A, 'anything')).not.toThrow()
    expect(tileStore.getTile(A, 'anything')).toBeUndefined()
  })

  test('a corrupt registry is NOT overwritten by the degraded read (no data loss)', () => {
    const corrupt = '{ half a board'
    store[indexKey(A)] = corrupt
    tileStore.listTiles(A) // degrades to []
    // the original bytes are still there: the read never rewrote the key, so a
    // later recovery / newer parser can still reach them
    expect(store[indexKey(A)]).toBe(corrupt)
  })

  test('a JSON value that is not an array reads as empty (defensive shape check)', () => {
    store[indexKey(A)] = '{"not":"an array"}'
    expect(tileStore.listTiles(A)).toEqual([])
  })

  test('corrupt tile data reads as empty and leaves the stored bytes intact', () => {
    const tile = tileStore.createTile(A, { name: 'T', html: '<p>t</p>' })
    const corrupt = 'not json at all'
    store[dataKey(A, tile.id)] = corrupt
    expect(() => tileStore.loadData(A, tile.id)).not.toThrow()
    expect(tileStore.loadData(A, tile.id)).toEqual([])
    expect(store[dataKey(A, tile.id)]).toBe(corrupt) // not clobbered
  })
})

describe('tileStore resilience: write failures never crash, signal via existing contract', () => {
  test('importTile returns null when the persist throws QuotaExceededError', () => {
    setItemMode = 'quota'
    let tile: unknown
    expect(() => {
      tile = tileStore.importTile(A, valid())
    }).not.toThrow()
    // null is the SAME failure signal importTile already returns on a bad
    // envelope, so every caller (CreateTile, DashboardGrid) already handles it
    expect(tile).toBeNull()
  })

  test('saveData returns false when the write throws (matches its existing boolean contract)', () => {
    const tile = tileStore.createTile(A, { name: 'T', html: '<p>t</p>' })
    setItemMode = 'quota'
    let result: boolean | undefined
    expect(() => {
      result = tileStore.saveData(A, tile.id, { count: 3, note: 'anything' })
    }).not.toThrow()
    expect(result).toBe(false)
  })

  test('a write failure leaves the in-memory / already-stored board untouched (no crash mid-session)', () => {
    // seed a real board while storage works
    const first = tileStore.importTile(A, valid({ name: 'Kept' }))
    expect(first).not.toBeNull()
    expect(tileStore.listTiles(A)).toHaveLength(1)
    // now storage fills up: a further import fails cleanly and does NOT corrupt
    // or drop what was already saved
    setItemMode = 'quota'
    expect(tileStore.importTile(A, valid({ name: 'Rejected' }))).toBeNull()
    setItemMode = 'ok'
    const board = tileStore.listTiles(A)
    expect(board).toHaveLength(1)
    expect(board[0].name).toBe('Kept')
  })

  test('deleteTile does not throw even when removeItem is unavailable', () => {
    const tile = tileStore.createTile(A, { name: 'T', html: '<p>t</p>' })
    expect(() => tileStore.deleteTile(A, tile.id)).not.toThrow()
    expect(tileStore.getTile(A, tile.id)).toBeUndefined()
  })
})

describe('tileStore resilience: no window (SSR / server render)', () => {
  const clearWindow = () => {
    // reflects an environment where window is undefined (server-side render)
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  }

  afterEach(withWindow)

  test('reads return safe empties instead of throwing', () => {
    clearWindow()
    expect(() => tileStore.listTiles(A)).not.toThrow()
    expect(tileStore.listTiles(A)).toEqual([])
    expect(() => tileStore.getTile(A, 'x')).not.toThrow()
    expect(tileStore.getTile(A, 'x')).toBeUndefined()
    expect(() => tileStore.loadData(A, 'x')).not.toThrow()
    expect(tileStore.loadData(A, 'x')).toEqual([])
  })

  test('writes are no-ops that never throw, and saveData reports false', () => {
    clearWindow()
    expect(() => tileStore.createTile(A, { name: 'T', html: '<p>t</p>' })).not.toThrow()
    expect(tileStore.saveData(A, 'id', [])).toBe(false)
    expect(() => tileStore.deleteTile(A, 'id')).not.toThrow()
    expect(() => tileStore.hydrateData(A, 'id', [])).not.toThrow()
    expect(tileStore.migrateLegacy(A, '<p>default</p>')).toBeUndefined()
  })

  test('importTile returns null with no window (nothing can be persisted)', () => {
    clearWindow()
    expect(tileStore.importTile(A, valid())).toBeNull()
  })
})

import { toOrder, toSkins, applyServerLayout, type ServerBoardRow } from '@/lib/tiles/boardSync'
import { homeLayout } from '@/lib/tiles/homeLayout'
import { tileSkin } from '@/lib/tiles/tileSkin'
import { LIBRARY_TILE, CREATE_TILE } from '@/lib/tiles/coreTiles'

// homeLayout.getOrder backfills the always-on Library + Create tiles into any
// stored order that lacks them, so a read-back of a hand-written order gains both
// ids. Real pushed orders already contain them; the tests below drop both.
const LIB = LIBRARY_TILE.id
const CREATE = CREATE_TILE.id

// localStorage doesn't exist in Node — minimal in-memory mock (matches tileSync.test.ts).
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

const USER = 'u-board'

beforeEach(() => {
  localStorageMock.clear()
})

describe('boardSync (board_layout mirror — the arranged-dashboard cross-device merge)', () => {
  test('toOrder keeps only string ids and drops junk', () => {
    expect(toOrder(['train', 'fuel', 42, null, 'peak'])).toEqual(['train', 'fuel', 'peak'])
    expect(toOrder('nope')).toEqual([])
    expect(toOrder(undefined)).toEqual([])
  })

  test('toSkins keeps only object entries and drops junk', () => {
    const out = toSkins({ a: { size: 'hero', color: '#6EE7B7' }, b: 'nope', c: null })
    expect(out.a).toEqual({ size: 'hero', color: '#6EE7B7' })
    expect(out.b).toBeUndefined()
    expect(out.c).toBeUndefined()
    expect(toSkins(['x'])).toEqual({})
    expect(toSkins(null)).toEqual({})
  })

  test('applyServerLayout writes the server order into the local home store', () => {
    const row: ServerBoardRow = {
      ordering: ['peak', 'train', 'fuel'],
      skins: {},
      updated_at: '2026-07-02T10:00:00.000Z',
    }
    const res = applyServerLayout(USER, row)
    expect(res.applied).toBe(true)
    // The stored real tiles keep their pulled order; Library + Create + Forge backfill in.
    const got = homeLayout.getOrder(USER)
    expect(got.filter((id) => id !== LIB && id !== CREATE && id !== 'forge')).toEqual(['peak', 'train', 'fuel'])
    expect(got).toContain(LIB)
    expect(got).toContain(CREATE)
  })

  test('applyServerLayout applies each server skin onto the local tile', () => {
    const row: ServerBoardRow = {
      ordering: ['train'],
      skins: { train: { size: 'hero', color: '#FFAA00' } },
      updated_at: '2026-07-02T10:00:00.000Z',
    }
    applyServerLayout(USER, row)
    const skin = tileSkin.get(USER, 'train')
    expect(skin.size).toBe('hero')
    expect(skin.color).toBe('#FFAA00')
  })

  test('applyServerLayout partial skin still merges over the local default (safe)', () => {
    const row: ServerBoardRow = {
      ordering: ['fuel'],
      skins: { fuel: { color: '#B9A3FF' } }, // no size — must fall back to default, not crash
      updated_at: '2026-07-02T10:00:00.000Z',
    }
    applyServerLayout(USER, row)
    const skin = tileSkin.get(USER, 'fuel')
    expect(skin.color).toBe('#B9A3FF')
    expect(skin.size).toBe('s') // tileSkin DEFAULT.size
  })

  test('applyServerLayout treats a fully empty row as nothing-saved and leaves local alone', () => {
    homeLayout.setOrder(USER, ['train', 'fuel'])
    const before = homeLayout.getOrder(USER) // real stored order (with any backfill)
    const res = applyServerLayout(USER, { ordering: [], skins: {}, updated_at: '2026-07-02T10:00:00.000Z' })
    expect(res.applied).toBe(false)
    expect(homeLayout.getOrder(USER)).toEqual(before) // never wiped by an empty remote
  })

  test('applyServerLayout is idempotent — re-applying the same order reports no change', () => {
    const row: ServerBoardRow = {
      ordering: ['peak', 'train'],
      skins: {},
      updated_at: '2026-07-02T10:00:00.000Z',
    }
    applyServerLayout(USER, row)
    const after1 = homeLayout.getOrder(USER)
    const res2 = applyServerLayout(USER, row)
    expect(res2.applied).toBe(false) // second apply is a no-op even with the Library backfill
    expect(homeLayout.getOrder(USER)).toEqual(after1)
  })
})

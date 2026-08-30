import { rowToTile, mergeRows, pruneTombstoned, streamFieldsOf, type ServerTileRow } from '@/lib/tiles/tileSync'
import { tileStore } from '@/lib/tiles/tileStore'
import { tileSkin } from '@/lib/tiles/tileSkin'

// localStorage doesn't exist in Node — minimal in-memory mock (matches tileSkin.test.ts).
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

const USER = 'u-sync'

const row: ServerTileRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Beer tracker',
  html: '<p>beer</p>',
  stream: { key: 'beer', label: 'Beers', kind: 'count' },
  category: 'Health',
  color: '#6EE7B7',
  source: 'mcp',
  created_at: '2026-06-30T10:00:00.000Z',
  updated_at: '2026-06-30T11:00:00.000Z',
}

beforeEach(() => {
  localStorageMock.clear()
})

describe('tileSync (tiles-table contract — the MCP -> dashboard merge)', () => {
  test('rowToTile maps a server row to a local Tile', () => {
    const t = rowToTile(row)
    expect(t.id).toBe(row.id)
    expect(t.name).toBe('Beer tracker')
    expect(t.html).toBe('<p>beer</p>')
    expect(t.category).toBe('Health')
    expect(t.createdAt).toBe(new Date('2026-06-30T10:00:00.000Z').getTime())
    expect(t.updatedAt).toBe(new Date('2026-06-30T11:00:00.000Z').getTime())
  })

  test('rowToTile tolerates null category', () => {
    expect(rowToTile({ ...row, category: null }).category).toBeUndefined()
  })

  test('mergeRows adopts a new server tile into the local index', () => {
    const res = mergeRows(USER, [row])
    expect(res.merged).toBe(1)
    expect(tileStore.getTile(USER, row.id)).toBeTruthy()
  })

  test('mergeRows seeds the color skin from the row', () => {
    mergeRows(USER, [row])
    expect(tileSkin.get(USER, row.id).color).toBe('#6EE7B7')
  })

  test('mergeRows is idempotent — a re-sync never duplicates', () => {
    mergeRows(USER, [row])
    const res2 = mergeRows(USER, [row])
    expect(res2.merged).toBe(0)
    expect(tileStore.listTiles(USER).filter((t) => t.id === row.id)).toHaveLength(1)
  })

  test('mergeRows never overwrites a tile already local (local wins)', () => {
    const local = tileStore.createTile(USER, { name: 'Local', html: '<p>x</p>' })
    const res = mergeRows(USER, [{ ...row, id: local.id, name: 'ServerName' }])
    expect(res.merged).toBe(0)
    expect(tileStore.getTile(USER, local.id)!.name).toBe('Local')
  })

  test('mergeRows handles a mix of new + existing in one pass', () => {
    tileStore.createTile(USER, { name: 'Local', html: '<p>x</p>' })
    const res = mergeRows(USER, [row, { ...row, id: '22222222-2222-2222-2222-222222222222', name: 'Second' }])
    expect(res.merged).toBe(2)
    expect(tileStore.listTiles(USER)).toHaveLength(3) // 1 local + 2 merged
  })

  test('mergeRows overwrites a local tile when the server row is strictly newer (cross-device edit propagates)', () => {
    mergeRows(USER, [row]) // adopt at 11:00
    const newer = {
      ...row,
      name: 'Renamed elsewhere',
      html: '<p>edited</p>',
      color: '#FFAA00',
      updated_at: '2026-06-30T12:00:00.000Z',
    }
    const res = mergeRows(USER, [newer])
    expect(res.merged).toBe(1)
    const t = tileStore.getTile(USER, row.id)!
    expect(t.name).toBe('Renamed elsewhere')
    expect(t.html).toBe('<p>edited</p>')
    expect(tileSkin.get(USER, row.id).color).toBe('#FFAA00') // recolor crosses too
  })

  test('mergeRows ignores a server row that is older-or-equal (local edit wins)', () => {
    mergeRows(USER, [row]) // adopt at 11:00
    const older = { ...row, name: 'Stale', updated_at: '2026-06-30T10:30:00.000Z' }
    const res = mergeRows(USER, [older])
    expect(res.merged).toBe(0)
    expect(tileStore.getTile(USER, row.id)!.name).toBe('Beer tracker')
  })

  test('pruneTombstoned removes only local tiles whose id is tombstoned', () => {
    const a = tileStore.createTile(USER, { name: 'A', html: '<p>a</p>' })
    const b = tileStore.createTile(USER, { name: 'B', html: '<p>b</p>' })
    const res = pruneTombstoned(USER, [a.id, '99999999-9999-9999-9999-999999999999'])
    expect(res.pruned).toBe(1)
    expect(tileStore.getTile(USER, a.id)).toBeUndefined()
    expect(tileStore.getTile(USER, b.id)).toBeTruthy()
  })
})

describe('declared stream identity crosses the tiles table (PATCH21 parity for MCP tiles)', () => {
  test('rowToTile adopts key/label/kind/goalDirection from the stream jsonb', () => {
    const t = rowToTile({
      ...row,
      stream: { key: 'beer', label: 'Beers', kind: 'count', goalDirection: 'down' },
    })
    expect(t.key).toBe('beer')
    expect(t.label).toBe('Beers')
    expect(t.kind).toBe('count')
    expect(t.goalDirection).toBe('down')
  })

  test("rowToTile maps 'neutral' goalDirection to undefined (Tile carries up/down only, like importTile)", () => {
    const t = rowToTile({ ...row, stream: { key: 'k', label: 'L', kind: 'count', goalDirection: 'neutral' } })
    expect(t.kind).toBe('count')
    expect(t.goalDirection).toBeUndefined()
  })

  test('streamFieldsOf shape-checks field-by-field (a malformed blob never poisons the Tile)', () => {
    expect(streamFieldsOf(null)).toEqual({})
    expect(streamFieldsOf('beer')).toEqual({})
    expect(streamFieldsOf(['beer'])).toEqual({})
    expect(
      streamFieldsOf({ key: 42, label: '   ', kind: 'nonsense', goalDirection: 'sideways' }),
    ).toEqual({})
    // valid fields survive alongside invalid ones
    expect(streamFieldsOf({ key: ' beer ', kind: 'count', goalDirection: 7 })).toEqual({
      key: 'beer',
      kind: 'count',
    })
  })

  test('a strictly-newer server row refreshes the declared stream on the local copy', () => {
    mergeRows(USER, [{ ...row, stream: { key: 'beer', label: 'Beers', kind: 'count', goalDirection: 'down' } }])
    const newer = {
      ...row,
      stream: { key: 'beer', label: 'Cold ones', kind: 'count', goalDirection: 'down' },
      updated_at: '2026-06-30T12:00:00.000Z',
    }
    expect(mergeRows(USER, [newer]).merged).toBe(1)
    const t = tileStore.getTile(USER, row.id)!
    expect(t.label).toBe('Cold ones')
    expect(t.goalDirection).toBe('down')
  })

  test('a stream-less newer server row never strips a local declaration (no silent scoring-mode flip)', () => {
    mergeRows(USER, [{ ...row, stream: { key: 'beer', label: 'Beers', kind: 'count', goalDirection: 'down' } }])
    const newer = { ...row, name: 'Renamed', stream: null, updated_at: '2026-06-30T12:00:00.000Z' }
    expect(mergeRows(USER, [newer]).merged).toBe(1)
    const t = tileStore.getTile(USER, row.id)!
    expect(t.name).toBe('Renamed') // the edit still lands
    expect(t.key).toBe('beer') // the declaration survives
    expect(t.kind).toBe('count')
    expect(t.goalDirection).toBe('down')
  })
})

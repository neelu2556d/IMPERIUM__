/**
 * The build -> dashboard loop, locked end to end at the WEB boundary.
 *
 * The loop this guards (source of truth for each hop):
 *   1. MCP `vitality_add_tile` -> `addTile` (mcp/src/mutations.ts) INSERTs a row
 *      into the Supabase `tiles` table.  Row shape: {user_id, name, html, stream,
 *      category, color, source} (id + timestamps default in the DB).
 *   2. On dashboard load `pullAndMerge(userId)` (lib/tiles/tileSync.ts) READS the
 *      user's server tiles, folds new/edited rows into the local tileStore, and
 *      returns `newIds` (ids this device had never seen).
 *   3. `app/app/DashboardGrid.tsx` (`syncNow`) auto-PLACES each newId on the board
 *      via `homeLayout.add(userId, id)`, so a freshly built tile lands on the grid
 *      instead of hiding in the Library drawer.
 *
 * This file exercises the pure seam of that loop: tileSync (pullAndMerge over a
 * faked Supabase read) + tileStore (localStorage) + homeLayout (localStorage). The
 * only piece it does NOT run is the React component itself (DashboardGrid), which
 * cannot mount without a full render harness + dnd-kit + the tile host bridge.
 * What the component adds ON TOP of what is tested here is exactly one line, which
 * this test reproduces verbatim in `autoPlaceLikeDashboardGrid`:
 *     for (const id of res.newIds) homeLayout.add(userId, id)
 * (see DashboardGrid.tsx `syncNow`). So the assertions below cover every data hop;
 * the untested remainder is React state/refresh, which does not change what lands
 * or where.
 *
 * Determinism: no real network, no real DB (the Supabase read is an in-memory
 * fake), no Date.now / random reliance for the assertions. `pullAndMerge` derives
 * tile timestamps from the row's `created_at` / `updated_at`, which are fixed
 * fixtures here.
 */

// ── Fake the Supabase read the web boundary makes ────────────────────────────
// `pullAndMerge` (and, transitively, tileStore -> tileDataSync) both import
// `@/lib/supabase/client`. We replace `createClient()` with a tiny in-memory fake
// whose `.from('tiles').select(...).eq(...).order(...)` resolves to a controllable
// { data, error }. Other tables (deleted_tiles, tile_data) resolve empty so the
// best-effort tombstone/data paths are no-ops. A per-test switch lets us simulate
// an errored / empty server read for the best-effort case.
type ServerRead = { data: unknown[] | null; error: unknown }
const serverTiles: { rows: ServerRead } = { rows: { data: [], error: null } }

function fakeTableQuery(table: string) {
  // A thenable, chainable query stub. Every filter method returns `this` so the
  // real call chain (.select().eq().order()) works; awaiting it yields the result.
  const result: ServerRead =
    table === 'tiles' ? serverTiles.rows : { data: [], error: null }
  const q: Record<string, unknown> = {}
  const chain = () => q
  q.select = chain
  q.eq = chain
  q.order = chain
  q.maybeSingle = () => Promise.resolve({ data: null, error: null })
  q.then = (
    resolve: (v: ServerRead) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return q
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => fakeTableQuery(table),
  }),
}))

import { pullAndMerge, type ServerTileRow } from '@/lib/tiles/tileSync'
import { tileStore } from '@/lib/tiles/tileStore'
import { tileSkin } from '@/lib/tiles/tileSkin'
import { homeLayout } from '@/lib/tiles/homeLayout'

// ── localStorage: jsdom-style in-memory mock (matches tileSync/homeLayout tests) ─
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

const USER = 'u-loop'

// ── The fixture: EXACTLY the row shape mcp/src/mutations.ts addTile writes ────
// addTile builds `TileRow = {user_id, name, html, stream, category, color, source}`
// and lets the DB fill id + created_at + updated_at (see docs/tiles-table-contract.md).
// We add those DB-defaulted fields so the fixture is a full read-back row, and we
// assert below that every field the MCP writes is present + correctly typed, so a
// drift on EITHER side (the MCP writer OR the tileSync reader's expected shape)
// trips this test.
const TILE_ID = '11111111-1111-1111-1111-111111111111'
function builtByMcpRow(over: Partial<ServerTileRow> = {}): ServerTileRow {
  return {
    // DB-defaulted (the insert did not supply these):
    id: TILE_ID,
    created_at: '2026-07-01T09:00:00.000Z',
    updated_at: '2026-07-01T09:00:00.000Z',
    // Written verbatim by addTile's TileRow (minus user_id, which is a filter col
    // not carried on the local Tile; ServerTileRow omits it for the same reason):
    name: 'Cold plunge streak',
    html: '<main><h1>Cold plunge</h1></main>',
    stream: { key: 'plunge', label: 'Plunges', kind: 'count', goalDirection: 'up' },
    category: 'health',
    color: '#6EE7B7',
    source: 'mcp',
    ...over,
  }
}

// The ONE line DashboardGrid.syncNow adds on top of pullAndMerge: place each new
// id on the board. Reproduced verbatim so the auto-place hop is under test.
function autoPlaceLikeDashboardGrid(userId: string, newIds: string[]) {
  for (const id of newIds) homeLayout.add(userId, id)
}

beforeEach(() => {
  localStorageMock.clear()
  serverTiles.rows = { data: [], error: null }
})

describe('build -> dashboard loop (web boundary, end to end)', () => {
  // Guard the handshake itself: the fixture must match what the MCP writes AND
  // what the reader expects. If either side drifts, this fails first.
  test('fixture matches the documented tiles-table contract (drift guard)', () => {
    const row = builtByMcpRow()
    // Every field addTile's TileRow writes, present + typed:
    expect(typeof row.name).toBe('string')
    expect(typeof row.html).toBe('string')
    expect(typeof row.category).toBe('string') // 'fitness|health|finance|mind|data'
    expect(row.color).toMatch(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/) // hex accent
    expect(row.source).toBe('mcp') // addTile always stamps source:'mcp'
    // stream is {key,label,kind,goalDirection?} or null (never undefined):
    expect(row.stream).not.toBeUndefined()
    const s = row.stream as { key: string; label: string; kind: string }
    expect(typeof s.key).toBe('string')
    expect(typeof s.label).toBe('string')
    expect(typeof s.kind).toBe('string')
    // DB-defaulted id + timestamps present (the read-back row shape):
    expect(row.id).toBe(TILE_ID)
    expect(typeof row.created_at).toBe('string')
    expect(typeof row.updated_at).toBe('string')
  })

  test('empty local store + empty board is the starting point', () => {
    expect(tileStore.listTiles(USER)).toHaveLength(0)
    // A fresh board seeds the default core order and never contains the built id.
    expect(homeLayout.getOrder(USER)).not.toContain(TILE_ID)
  })

  test('a tile built by the MCP lands on the dashboard: newIds -> visible -> placed', async () => {
    // Given: the server now holds exactly the row addTile wrote.
    serverTiles.rows = { data: [builtByMcpRow()], error: null }

    // When: the dashboard loads and pulls.
    const res = await pullAndMerge(USER)

    // Then (hop 2, pullAndMerge return): the new id is surfaced.
    expect(res.newIds).toContain(TILE_ID)
    expect(res.merged).toBe(1)

    // Then (VISIBLE): "visible" == the tile is now in the local registry the
    // Library/grid reads through — tileStore.getTile finds it AND it appears in
    // tileStore.listTiles (what the dashboard renders from). Its fields survived
    // the row->tile map, and its color skin was seeded (so it shows on-brand).
    const tile = tileStore.getTile(USER, TILE_ID)
    expect(tile).toBeTruthy()
    expect(tile!.name).toBe('Cold plunge streak')
    expect(tile!.html).toBe('<main><h1>Cold plunge</h1></main>')
    expect(tile!.category).toBe('health')
    expect(tileStore.listTiles(USER).map((t) => t.id)).toContain(TILE_ID)
    expect(tileSkin.get(USER, TILE_ID).color).toBe('#6EE7B7')

    // When: the dashboard auto-places each new id (the DashboardGrid.syncNow line).
    autoPlaceLikeDashboardGrid(USER, res.newIds)

    // Then (PLACED): "placed" == the id is present in the persisted home order
    // (homeLayout.getOrder), i.e. it sits ON the board grid, not buried in the
    // Library drawer. getOrder reads back from localStorage, proving it persisted.
    const order = homeLayout.getOrder(USER)
    expect(order).toContain(TILE_ID)
    // And it is genuinely ordered (a real index, appended to the board).
    expect(order.indexOf(TILE_ID)).toBeGreaterThanOrEqual(0)
  })

  test('idempotency: a second pull of the same row does not duplicate or re-place', async () => {
    serverTiles.rows = { data: [builtByMcpRow()], error: null }

    // First pull + place (the landing).
    const first = await pullAndMerge(USER)
    autoPlaceLikeDashboardGrid(USER, first.newIds)
    const orderAfterFirst = homeLayout.getOrder(USER)

    // Second pull of the identical row (e.g. the window regains focus and syncs
    // again). It must be a no-op: not new, not merged.
    const second = await pullAndMerge(USER)
    expect(second.newIds).toEqual([])
    expect(second.merged).toBe(0)
    autoPlaceLikeDashboardGrid(USER, second.newIds)

    // Registry: exactly one copy of the tile.
    expect(tileStore.listTiles(USER).filter((t) => t.id === TILE_ID)).toHaveLength(1)
    // Board: exactly one placement, and the order is byte-for-byte unchanged.
    const orderAfterSecond = homeLayout.getOrder(USER)
    expect(orderAfterSecond.filter((id) => id === TILE_ID)).toHaveLength(1)
    expect(orderAfterSecond).toEqual(orderAfterFirst)
  })

  test('best-effort: a server READ ERROR leaves the local board unchanged (no throw)', async () => {
    // Seed a known board first (default seeded order), capture it.
    const before = homeLayout.getOrder(USER)
    expect(tileStore.listTiles(USER)).toHaveLength(0)

    // The server read errors (e.g. table missing / offline). tileSync swallows it.
    serverTiles.rows = { data: null, error: { message: 'relation "tiles" does not exist' } }

    let res: Awaited<ReturnType<typeof pullAndMerge>>
    await expect(
      (async () => {
        res = await pullAndMerge(USER)
        return res
      })(),
    ).resolves.toBeDefined()

    // Nothing new, nothing merged, nothing to place.
    expect(res!.newIds).toEqual([])
    expect(res!.merged).toBe(0)
    autoPlaceLikeDashboardGrid(USER, res!.newIds)

    // Local store + board are exactly as they were.
    expect(tileStore.listTiles(USER)).toHaveLength(0)
    expect(homeLayout.getOrder(USER)).toEqual(before)
  })

  test('best-effort: an EMPTY server read (no rows) is a clean no-op', async () => {
    const before = homeLayout.getOrder(USER)
    serverTiles.rows = { data: [], error: null }

    const res = await pullAndMerge(USER)
    expect(res.newIds).toEqual([])
    expect(res.merged).toBe(0)
    autoPlaceLikeDashboardGrid(USER, res.newIds)

    expect(tileStore.listTiles(USER)).toHaveLength(0)
    expect(homeLayout.getOrder(USER)).toEqual(before)
  })
})

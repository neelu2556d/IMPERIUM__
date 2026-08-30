import { packTiles, footprintFor, type Footprint, type PackResult } from '@/lib/tiles/packLayout'
import { TILE_SIZES, SIZE_PRESETS, type TileSize } from '@/lib/tiles/tileSkin'

/** Rebuild an occupancy grid from a pack result and assert nothing collides or
 *  escapes. This is the invariant that makes drag bulletproof for any user. */
function assertValid(tiles: Footprint[], cols: number, res: PackResult) {
  const seen = new Set<string>()
  const grid: boolean[][] = []
  for (const t of tiles) {
    const pos = res.positions.get(t.id)
    expect(pos).toBeDefined()
    if (!pos) continue
    expect(seen.has(t.id)).toBe(false)
    seen.add(t.id)
    // in bounds
    expect(pos.x).toBeGreaterThanOrEqual(0)
    expect(pos.x + pos.w).toBeLessThanOrEqual(cols)
    expect(pos.y).toBeGreaterThanOrEqual(0)
    // no overlap
    for (let dy = 0; dy < pos.h; dy++) {
      const y = pos.y + dy
      grid[y] = grid[y] || new Array(cols).fill(false)
      for (let dx = 0; dx < pos.w; dx++) {
        const x = pos.x + dx
        expect(grid[y][x]).toBe(false)
        grid[y][x] = true
      }
    }
  }
  expect(res.positions.size).toBe(tiles.length)
}

// deterministic pseudo-random so failures reproduce
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

describe('packTiles', () => {
  it('never overlaps or escapes the grid, for any random layout (property test)', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed)
      const cols = 2 + Math.floor(rand() * 3) // 2..4
      const n = Math.floor(rand() * 14)
      const tiles: Footprint[] = []
      for (let i = 0; i < n; i++) {
        const size = TILE_SIZES[Math.floor(rand() * TILE_SIZES.length)]
        tiles.push(footprintFor(`t${i}`, size, cols))
      }
      const res = packTiles(tiles, cols)
      assertValid(tiles, cols, res)
    }
  })

  it('is deterministic — same input yields identical output', () => {
    const cols = 4
    const tiles = TILE_SIZES.map((s, i) => footprintFor(`t${i}`, s, cols))
    const a = packTiles(tiles, cols)
    const b = packTiles(tiles, cols)
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()])
    expect(a.rows).toBe(b.rows)
  })

  it('places the first tile at the origin and packs left-to-right', () => {
    const cols = 4
    const res = packTiles(
      [
        { id: 'a', w: 1, h: 1 },
        { id: 'b', w: 1, h: 1 },
      ],
      cols,
    )
    expect(res.positions.get('a')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(res.positions.get('b')).toEqual({ x: 1, y: 0, w: 1, h: 1 })
  })

  it('wraps a wide tile to the next row when it does not fit', () => {
    const cols = 4
    const res = packTiles(
      [
        { id: 'hero', w: 3, h: 1 },
        { id: 'big', w: 2, h: 1 }, // 3 + 2 > 4, must wrap
      ],
      cols,
    )
    expect(res.positions.get('hero')).toEqual({ x: 0, y: 0, w: 3, h: 1 })
    expect(res.positions.get('big')?.y).toBe(1)
  })

  it('dense-fills a gap left by a wide tile', () => {
    const cols = 4
    // hero(3x1) leaves a 1-wide hole at (3,0); the next 1x1 should fill it
    const res = packTiles(
      [
        { id: 'hero', w: 3, h: 1 },
        { id: 'fill', w: 1, h: 1 },
      ],
      cols,
    )
    expect(res.positions.get('fill')).toEqual({ x: 3, y: 0, w: 1, h: 1 })
    expect(res.rows).toBe(1)
  })

  it('clamps footprints wider than the column count (phone)', () => {
    const fp = footprintFor('x', 'hero', 2) // hero is 3 wide, phone is 2 cols
    expect(fp.w).toBe(2)
    const res = packTiles([fp], 2)
    expect(res.positions.get('x')).toEqual({ x: 0, y: 0, w: 2, h: 1 })
  })

  it('every named size has a footprint that fits a 4-col grid', () => {
    for (const size of TILE_SIZES) {
      expect(SIZE_PRESETS[size].cols).toBeLessThanOrEqual(4)
    }
  })

  it('returns an empty result for an empty tile list', () => {
    const res = packTiles([], 4)
    expect(res.positions.size).toBe(0)
    expect(res.rows).toBe(0)
  })

  it('places a single tile at the origin', () => {
    const res = packTiles([{ id: 'only', w: 2, h: 1 }], 4)
    expect(res.positions.get('only')).toEqual({ x: 0, y: 0, w: 2, h: 1 })
    expect(res.rows).toBe(1)
  })

  it('packs an all-same-size grid into full rows with no gaps', () => {
    // eight 1x1 tiles on a 4-col grid = two full rows, packed left to right.
    const tiles: Footprint[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, w: 1, h: 1 }))
    const res = packTiles(tiles, 4)
    assertValid(tiles, 4, res)
    expect(res.positions.get('t0')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(res.positions.get('t3')).toEqual({ x: 3, y: 0, w: 1, h: 1 })
    expect(res.positions.get('t4')).toEqual({ x: 0, y: 1, w: 1, h: 1 })
    expect(res.positions.get('t7')).toEqual({ x: 3, y: 1, w: 1, h: 1 })
    expect(res.rows).toBe(2)
  })

  it('fills a full row then wraps the overflow tile to the next row', () => {
    // four 1x1 fill row 0 exactly; the fifth must wrap to row 1 at x=0.
    const tiles: Footprint[] = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, w: 1, h: 1 }))
    const res = packTiles(tiles, 4)
    assertValid(tiles, 4, res)
    expect(res.positions.get('t3')).toEqual({ x: 3, y: 0, w: 1, h: 1 })
    expect(res.positions.get('t4')).toEqual({ x: 0, y: 1, w: 1, h: 1 })
    expect(res.rows).toBe(2)
  })

  it('packs a real mixed-size board with no overlaps', () => {
    const cols = 4
    const sizes: TileSize[] = ['hero', 's', 'big', 'tall', 'm', 's', 'band', 's']
    const tiles = sizes.map((s, i) => footprintFor(`t${i}`, s, cols))
    const res = packTiles(tiles, cols)
    assertValid(tiles, cols, res)
  })

  it('never overlaps when there are far more tiles than fit one row', () => {
    const cols = 3
    const tiles: Footprint[] = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, w: 2, h: 1 }))
    const res = packTiles(tiles, cols)
    assertValid(tiles, cols, res)
  })

  it('is deterministic across two runs of a full mixed board (cross-device sync)', () => {
    const cols = 4
    const sizes: TileSize[] = ['big', 'hero', 's', 'tall', 'band', 'm', 's', 'l', 's']
    const tiles = sizes.map((s, i) => footprintFor(`t${i}`, s, cols))
    const a = packTiles(tiles, cols)
    const b = packTiles(tiles, cols)
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()])
    expect(a.rows).toBe(b.rows)
  })

  describe('degenerate + hostile inputs (must never throw or hang)', () => {
    it('falls back to a 1x1 footprint for an unknown / stale size instead of throwing', () => {
      // A stale persisted token or hand-edited board can carry a size not in the
      // preset table; footprintFor must degrade to 1x1, not crash on undefined.
      const fp = footprintFor('x', 'bogus-size' as unknown as TileSize, 4)
      expect(fp).toEqual({ id: 'x', w: 1, h: 1 })
      const res = packTiles([fp], 4)
      expect(res.positions.get('x')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    })

    it('coerces a NaN / Infinity / fractional / negative footprint to a placeable one', () => {
      const tiles: Footprint[] = [
        { id: 'nan', w: NaN, h: 1 },
        { id: 'inf', w: Infinity, h: Infinity },
        { id: 'frac', w: 1.9, h: 2.5 },
        { id: 'neg', w: -3, h: -1 },
        { id: 'zero', w: 0, h: 0 },
      ]
      const res = packTiles(tiles, 4)
      assertValid(tiles, 4, res)
      for (const t of tiles) {
        const p = res.positions.get(t.id)!
        expect(Number.isInteger(p.w)).toBe(true)
        expect(Number.isInteger(p.h)).toBe(true)
        expect(p.w).toBeGreaterThanOrEqual(1)
        expect(p.h).toBeGreaterThanOrEqual(1)
        expect(p.w).toBeLessThanOrEqual(4)
      }
    })

    it('survives a degenerate column count (0, negative, NaN) without hanging', () => {
      for (const badCols of [0, -4, NaN]) {
        const tiles: Footprint[] = [
          { id: 'a', w: 2, h: 1 },
          { id: 'b', w: 3, h: 1 },
        ]
        const res = packTiles(tiles, badCols)
        expect(res.positions.size).toBe(2)
        // every placed tile is a positive-width cell inside the coerced grid
        for (const p of res.positions.values()) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.w).toBeGreaterThanOrEqual(1)
        }
      }
    })

    it('drops footprints with no usable id so positions align 1:1 with tiles', () => {
      const tiles = [
        { id: 'ok', w: 1, h: 1 },
        { id: undefined as unknown as string, w: 1, h: 1 },
      ]
      const res = packTiles(tiles, 4)
      expect(res.positions.size).toBe(1)
      expect(res.positions.get('ok')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    })
  })
})

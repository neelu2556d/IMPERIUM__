import {
  tileSkin,
  TILE_SIZES,
  SIZE_PRESETS,
  SIZE_LABELS,
  nextSize,
  clampSpanToCols,
  type TileSize,
} from '@/lib/tiles/tileSkin'

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

const A = 'user-a'
beforeEach(() => localStorageMock.clear())

describe('tileSkin: how a tile looks (size, design, color, name)', () => {
  test('a tile with no skin set has sensible defaults', () => {
    expect(tileSkin.get(A, 't1')).toEqual({ size: 's', design: null, color: null, name: null, livingDots: true })
  })

  test('set patches and persists only the given fields', () => {
    tileSkin.set(A, 't1', { size: 'hero' })
    expect(tileSkin.get(A, 't1').size).toBe('hero')
    expect(tileSkin.get(A, 't1').design).toBeNull()
    tileSkin.set(A, 't1', { color: '#6EA8FF', name: 'My beers', livingDots: false })
    const s = tileSkin.get(A, 't1')
    expect(s).toEqual({ size: 'hero', design: null, color: '#6EA8FF', name: 'My beers', livingDots: false })
  })

  test('skins are isolated per tile and per user', () => {
    tileSkin.set(A, 't1', { size: 'tall' })
    expect(tileSkin.get(A, 't2').size).toBe('s')
    expect(tileSkin.get('user-b', 't1').size).toBe('s')
  })
})

describe('size taxonomy', () => {
  test('the seven presets', () => {
    expect(TILE_SIZES).toEqual(['s', 'm', 'tall', 'hero', 'big', 'band', 'l'])
  })

  test('every preset has a span and a label', () => {
    for (const s of TILE_SIZES) {
      expect(SIZE_PRESETS[s].cols).toBeGreaterThanOrEqual(1)
      expect(SIZE_PRESETS[s].rows).toBeGreaterThanOrEqual(1)
      expect(SIZE_LABELS[s]).toBeTruthy()
    }
  })

  test('spans encode the loved vocabulary (hero 3-wide, tall 1x2, big 2x2, band full)', () => {
    expect(SIZE_PRESETS.hero).toEqual({ cols: 3, rows: 1 })
    expect(SIZE_PRESETS.tall).toEqual({ cols: 1, rows: 2 })
    expect(SIZE_PRESETS.big).toEqual({ cols: 2, rows: 2 })
    expect(SIZE_PRESETS.band).toEqual({ cols: 4, rows: 1 })
  })

  test('nextSize cycles through all seven and wraps', () => {
    const seen: TileSize[] = []
    let s: TileSize = 's'
    for (let i = 0; i < TILE_SIZES.length; i++) {
      seen.push(s)
      s = nextSize(s)
    }
    expect(seen).toEqual(['s', 'm', 'tall', 'hero', 'big', 'band', 'l'])
    expect(nextSize('l')).toBe('s')
  })
})

describe('phone clamp', () => {
  test('caps columns to the grid width but never touches rows', () => {
    expect(clampSpanToCols(SIZE_PRESETS.hero, 2)).toEqual({ cols: 2, rows: 1 })
    expect(clampSpanToCols(SIZE_PRESETS.band, 2)).toEqual({ cols: 2, rows: 1 })
    expect(clampSpanToCols(SIZE_PRESETS.tall, 2)).toEqual({ cols: 1, rows: 2 })
    expect(clampSpanToCols(SIZE_PRESETS.big, 2)).toEqual({ cols: 2, rows: 2 })
  })
})

describe('legacy size migration (the old s/m/lw/lt vocabulary)', () => {
  test('lw maps forward to band, lt to big, s/m unchanged, on read', () => {
    localStorageMock.setItem(
      'vitality:user-a:tileSkins',
      JSON.stringify({
        a: { size: 'lw', design: null, color: null, name: null },
        b: { size: 'lt', design: null, color: null, name: null },
        c: { size: 'm', design: null, color: null, name: null },
      }),
    )
    expect(tileSkin.get(A, 'a').size).toBe('band')
    expect(tileSkin.get(A, 'b').size).toBe('big')
    expect(tileSkin.get(A, 'c').size).toBe('m')
  })

  test('an unknown size falls back to s', () => {
    localStorageMock.setItem('vitality:user-a:tileSkins', JSON.stringify({ a: { size: 'xxl' } }))
    expect(tileSkin.get(A, 'a').size).toBe('s')
  })
})

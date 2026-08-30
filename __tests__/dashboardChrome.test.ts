import { dashboardChrome, DEFAULT_CHROME, backgroundAccent } from '@/lib/tiles/dashboardChrome'

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

describe('dashboardChrome: the themeable world (wallpaper)', () => {
  test('a fresh dashboard is the default World (identical to today)', () => {
    expect(dashboardChrome.get(A)).toEqual(DEFAULT_CHROME)
    expect(dashboardChrome.get(A).background.mode).toBe('world')
  })

  test('setBackground persists a chosen background', () => {
    dashboardChrome.setBackground(A, { mode: 'gradient', c1: '#0b1f17', c2: '#040608', angle: 160 })
    expect(dashboardChrome.get(A).background).toEqual({ mode: 'gradient', c1: '#0b1f17', c2: '#040608', angle: 160 })
  })

  test('a partial stored world blob merges up to a full background', () => {
    localStorageMock.setItem('vitality:user-a:chrome', JSON.stringify({ background: { mode: 'world', accent: '#F5B044' } }))
    const bg = dashboardChrome.get(A).background
    expect(bg).toEqual({ mode: 'world', accent: '#F5B044', particles: 24, mountains: true, speed: 1 })
  })

  test('chrome is isolated per user', () => {
    dashboardChrome.setBackground(A, { mode: 'solid', color: '#000000' })
    expect(dashboardChrome.get('user-b')).toEqual(DEFAULT_CHROME)
  })

  test('reset returns to the default world', () => {
    dashboardChrome.setBackground(A, { mode: 'solid', color: '#000000' })
    expect(dashboardChrome.reset(A)).toEqual(DEFAULT_CHROME)
    expect(dashboardChrome.get(A)).toEqual(DEFAULT_CHROME)
  })

  test('backgroundAccent publishes the World accent into --wall-accent', () => {
    expect(backgroundAccent({ mode: 'world', accent: '#F5B044', particles: 24, mountains: true, speed: 1 })).toBe('#F5B044')
    expect(backgroundAccent({ mode: 'solid', color: '#000000' })).toBe('#6EE7B7')
  })
})

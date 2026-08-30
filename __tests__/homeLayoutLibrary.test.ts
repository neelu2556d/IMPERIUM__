import { homeLayout } from '@/lib/tiles/homeLayout'
import { DEFAULT_HOME_ORDER, LIBRARY_TILE, CREATE_TILE } from '@/lib/tiles/coreTiles'

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
const homeKey = (userId: string) => `vitality:${userId}:home`
beforeEach(() => localStorageMock.clear())

describe('homeLayout: the locked Library tile is always present', () => {
  test('a fresh dashboard includes the Library tile', () => {
    expect(homeLayout.getOrder(A)).toContain(LIBRARY_TILE.id)
  })

  test('the seeded default arrangement includes the Library tile', () => {
    expect(DEFAULT_HOME_ORDER).toContain(LIBRARY_TILE.id)
  })

  test('a stored order that predates Library gets it inserted at the prominent default slot', () => {
    // a returning user whose saved order has no 'library'
    localStorageMock.setItem(homeKey(A), JSON.stringify(['vee', 'train', 'fuel']))
    const order = homeLayout.getOrder(A)
    expect(order).toContain(LIBRARY_TILE.id)
    // inserted high up (its seeded slot), not dumped at the very end
    expect(order.indexOf(LIBRARY_TILE.id)).toBeLessThan(order.length - 1)
    // the rest of their custom arrangement is preserved in its original order
    // (all three locked tiles, Library + Create + Forge, are backfilled in)
    expect(order.filter((id) => id !== LIBRARY_TILE.id && id !== CREATE_TILE.id && id !== 'forge')).toEqual(['vee', 'train', 'fuel'])
  })

  test('the backfill is persisted so it only appends once (idempotent)', () => {
    localStorageMock.setItem(homeKey(A), JSON.stringify(['train', 'fuel']))
    homeLayout.getOrder(A)
    // the write-back should now have library in storage
    const persisted = JSON.parse(localStorageMock.getItem(homeKey(A)) as string)
    expect(persisted).toContain(LIBRARY_TILE.id)
    const order = homeLayout.getOrder(A)
    expect(order.filter((id) => id === LIBRARY_TILE.id)).toHaveLength(1)
  })

  test('a stored order that already has the locked tiles is left untouched', () => {
    const saved = ['vee', LIBRARY_TILE.id, CREATE_TILE.id, 'forge', 'train']
    localStorageMock.setItem(homeKey(A), JSON.stringify(saved))
    expect(homeLayout.getOrder(A)).toEqual(saved)
  })

  test('reset includes the Library tile', () => {
    homeLayout.setOrder(A, ['train', 'fuel'])
    expect(homeLayout.reset(A)).toContain(LIBRARY_TILE.id)
    expect(homeLayout.getOrder(A)).toContain(LIBRARY_TILE.id)
  })
})

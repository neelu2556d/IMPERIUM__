import { homeLayout } from '@/lib/tiles/homeLayout'
import { DEFAULT_HOME_ORDER, CREATE_TILE, LIBRARY_TILE } from '@/lib/tiles/coreTiles'

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

describe('homeLayout: the locked Create tile is always present (Library twin)', () => {
  test('a fresh dashboard includes the Create tile', () => {
    expect(homeLayout.getOrder(A)).toContain(CREATE_TILE.id)
  })

  test('the seeded default arrangement includes the Create tile, beside Library', () => {
    expect(DEFAULT_HOME_ORDER).toContain(CREATE_TILE.id)
    // Create sits immediately after Library (the platform pair: manage + build).
    expect(DEFAULT_HOME_ORDER.indexOf(CREATE_TILE.id)).toBe(
      DEFAULT_HOME_ORDER.indexOf(LIBRARY_TILE.id) + 1,
    )
  })

  test('a stored order that predates Create gets it backfilled high up, not dumped last', () => {
    localStorageMock.setItem(homeKey(A), JSON.stringify(['vee', 'train', 'fuel', 'library']))
    const order = homeLayout.getOrder(A)
    expect(order).toContain(CREATE_TILE.id)
    expect(order.indexOf(CREATE_TILE.id)).toBeLessThan(order.length - 1)
    // the rest of their custom arrangement is preserved in its original order
    // (Forge, Create's locked sibling, backfills in the same pass)
    expect(order.filter((id) => id !== CREATE_TILE.id && id !== 'forge')).toEqual(['vee', 'train', 'fuel', 'library'])
  })

  test('the backfill is persisted so it only appends once (idempotent)', () => {
    localStorageMock.setItem(homeKey(A), JSON.stringify(['train', 'fuel']))
    homeLayout.getOrder(A)
    const persisted = JSON.parse(localStorageMock.getItem(homeKey(A)) as string)
    expect(persisted).toContain(CREATE_TILE.id)
    const order = homeLayout.getOrder(A)
    expect(order.filter((id) => id === CREATE_TILE.id)).toHaveLength(1)
  })

  test('remove() can never take the Create tile off the dashboard', () => {
    // homeLayout.remove itself is unguarded (the DashboardGrid guard blocks the UI),
    // but even a raw removal is healed by the getOrder backfill on the next read.
    homeLayout.remove(A, CREATE_TILE.id)
    expect(homeLayout.getOrder(A)).toContain(CREATE_TILE.id)
  })

  test('reset includes the Create tile', () => {
    homeLayout.setOrder(A, ['train', 'fuel'])
    expect(homeLayout.reset(A)).toContain(CREATE_TILE.id)
    expect(homeLayout.getOrder(A)).toContain(CREATE_TILE.id)
  })
})

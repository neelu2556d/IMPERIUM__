import { homeLayout } from '@/lib/tiles/homeLayout'
import { DEFAULT_HOME_ORDER, VEE_TILE } from '@/lib/tiles/coreTiles'

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

describe('homeLayout: the one unified home order (core + Vee + user tiles)', () => {
  test('a fresh dashboard seeds from the approved default arrangement', () => {
    expect(homeLayout.getOrder(A)).toEqual(DEFAULT_HOME_ORDER)
  })

  test('the seed is a copy, not the shared constant (no accidental mutation)', () => {
    const order = homeLayout.getOrder(A)
    order.push('mutant')
    expect(DEFAULT_HOME_ORDER).not.toContain('mutant')
  })

  test('add appends a user tile, idempotently', () => {
    homeLayout.add(A, 'u1')
    homeLayout.add(A, 'u1')
    const order = homeLayout.getOrder(A)
    expect(order.filter((id) => id === 'u1')).toHaveLength(1)
    expect(order[order.length - 1]).toBe('u1')
  })

  test('remove takes a tile off the dashboard', () => {
    homeLayout.remove(A, 'finance')
    expect(homeLayout.getOrder(A)).not.toContain('finance')
  })

  test('Vee is now an ordinary optional tile: it CAN be removed', () => {
    homeLayout.remove(A, VEE_TILE.id)
    expect(homeLayout.getOrder(A)).not.toContain(VEE_TILE.id)
  })

  test('setOrder replaces the whole order verbatim (drag reorder)', () => {
    // Real drag orders always include the locked library + create + forge tiles.
    homeLayout.setOrder(A, ['vee', 'train', 'fuel', 'library', 'create', 'forge'])
    expect(homeLayout.getOrder(A)).toEqual(['vee', 'train', 'fuel', 'library', 'create', 'forge'])
  })

  test('library + create + forge are always guaranteed on read, but Vee is not auto-added', () => {
    homeLayout.setOrder(A, ['train', 'fuel'])
    const order = homeLayout.getOrder(A)
    // the locked tiles are backfilled at their prominent slots; none is ever lost
    expect(order).toEqual(['train', 'fuel', 'library', 'create', 'forge'])
    expect(order).not.toContain(VEE_TILE.id) // Vee stays removed; only the locked shelf is guaranteed
  })

  test('orders are isolated per user', () => {
    homeLayout.setOrder(A, ['vee', 'train'])
    expect(homeLayout.getOrder('user-b')).toEqual(DEFAULT_HOME_ORDER)
  })

  test('reset wipes customization back to the default', () => {
    homeLayout.setOrder(A, ['vee', 'train'])
    expect(homeLayout.reset(A)).toEqual(DEFAULT_HOME_ORDER)
    expect(homeLayout.getOrder(A)).toEqual(DEFAULT_HOME_ORDER)
  })
})

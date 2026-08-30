import { dashboardLayout } from '@/lib/tiles/dashboardLayout'
import type { Tile } from '@/lib/tiles/types'

// window.localStorage doesn't exist in Node, mirror tileStore's storage with a mock.
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
const B = 'user-b'
const tile = (id: string, name = id): Tile => ({ id, name, html: `<i>${id}</i>`, createdAt: 1, updatedAt: 1 })

beforeEach(() => localStorageMock.clear())

describe('dashboardLayout: which tiles sit on a user dashboard, in order', () => {
  test('a fresh dashboard has no placed tiles', () => {
    expect(dashboardLayout.getPlaced(A)).toEqual([])
  })

  test('adding a tile places it', () => {
    dashboardLayout.add(A, 't1')
    expect(dashboardLayout.getPlaced(A)).toEqual(['t1'])
  })

  test('placement order is preserved', () => {
    dashboardLayout.add(A, 't1')
    dashboardLayout.add(A, 't2')
    expect(dashboardLayout.getPlaced(A)).toEqual(['t1', 't2'])
  })

  test('adding the same tile twice does not duplicate it', () => {
    dashboardLayout.add(A, 't1')
    dashboardLayout.add(A, 't1')
    expect(dashboardLayout.getPlaced(A)).toEqual(['t1'])
  })

  test('removing a tile takes it off the dashboard', () => {
    dashboardLayout.add(A, 't1')
    dashboardLayout.add(A, 't2')
    dashboardLayout.remove(A, 't1')
    expect(dashboardLayout.getPlaced(A)).toEqual(['t2'])
  })

  test('layouts are isolated per user', () => {
    dashboardLayout.add(A, 't1')
    expect(dashboardLayout.getPlaced(B)).toEqual([])
  })

  test('setPlaced replaces the whole order (for drag reorder)', () => {
    dashboardLayout.add(A, 't1')
    dashboardLayout.add(A, 't2')
    dashboardLayout.setPlaced(A, ['t2', 't1'])
    expect(dashboardLayout.getPlaced(A)).toEqual(['t2', 't1'])
  })

  test('placed() resolves ids to tiles in layout order and skips deleted tiles', () => {
    dashboardLayout.add(A, 't1')
    dashboardLayout.add(A, 'gone')
    dashboardLayout.add(A, 't2')
    const tiles = [tile('t2'), tile('t1')] // registry order differs; 'gone' was deleted
    const resolved = dashboardLayout.placed(A, tiles)
    expect(resolved.map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

/**
 * Phase 5 feature 3 — spending insights. Locks heuristic categorization,
 * this-vs-last-month recap, and the category breakdown. A fixed `now` is passed
 * in so month-bucketing is deterministic.
 */
import { categorize, monthlyRecap, categoryBreakdown } from '@/app/app/finance/state'
import type { Order } from '@/app/app/finance/types'

const NOW = new Date(2026, 5, 13) // Jun 13 2026 (local)
const thisMonth = (day: number) => new Date(2026, 5, day).getTime()
const lastMonth = (day: number) => new Date(2026, 4, day).getTime()

function order(p: Partial<Order> & { id: string; ts: number }): Order {
  return {
    name: 'thing', amountCHF: 10, fromAccountId: null, date: null,
    deductedAt: null, pctAtDeduction: null, deductedFromName: null,
    ...p,
  }
}

describe('categorize', () => {
  test('maps keywords to categories, first match wins', () => {
    expect(categorize('Migros groceries run')).toBe('groceries')
    expect(categorize('Netflix')).toBe('subscriptions')
    expect(categorize('Uber to airport')).toBe('transport')
    expect(categorize('New MacBook')).toBe('tech')
    expect(categorize('Amazon order')).toBe('shopping')
    expect(categorize('Something random')).toBe('other')
  })
})

describe('monthlyRecap', () => {
  test('totals this vs last month and finds the biggest', () => {
    const orders = [
      order({ id: 'a', ts: thisMonth(2), amountCHF: 50, name: 'Coop' }),
      order({ id: 'b', ts: thisMonth(9), amountCHF: 120, name: 'Nike shoes' }),
      order({ id: 'c', ts: lastMonth(20), amountCHF: 80 }),
    ]
    const r = monthlyRecap(orders, NOW)
    expect(r.thisMonthCHF).toBe(170)
    expect(r.lastMonthCHF).toBe(80)
    expect(r.deltaCHF).toBe(90)
    expect(r.count).toBe(2)
    expect(r.biggest).toEqual({ name: 'Nike shoes', amountCHF: 120 })
  })

  test('deltaPct is null when there was no spend last month', () => {
    const r = monthlyRecap([order({ id: 'd', ts: thisMonth(1), amountCHF: 30 })], NOW)
    expect(r.lastMonthCHF).toBe(0)
    expect(r.deltaPct).toBeNull()
  })
})

describe('categoryBreakdown', () => {
  test('groups this month by category, largest first, pct sums ~100', () => {
    const orders = [
      order({ id: 'a', ts: thisMonth(2), amountCHF: 60, name: 'Migros' }),
      order({ id: 'b', ts: thisMonth(5), amountCHF: 40, name: 'Coffee bar' }),
      order({ id: 'c', ts: lastMonth(2), amountCHF: 999, name: 'ignored last month' }),
    ]
    const b = categoryBreakdown(orders, NOW)
    expect(b.map(c => c.category)).toEqual(['groceries', 'dining'])
    expect(b[0].total).toBe(60)
    expect(Math.round(b.reduce((s, c) => s + c.pct, 0))).toBe(100)
  })
})

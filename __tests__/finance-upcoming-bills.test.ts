/**
 * Phase 5 feature 1 — upcoming-bills timeline. Locks the "due in N days"
 * derivation (rolls the renewal anchor forward, filters to the window, sorts
 * soonest-first). Dates are computed relative to the real "today" so the test
 * is deterministic whenever it runs.
 */
import { upcomingBills } from '@/app/app/finance/state'
import type { Subscription } from '@/app/app/finance/types'

function isoOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sub(p: Partial<Subscription> & { id: string }): Subscription {
  return {
    name: 'S', amountCHF: 10, period: 'monthly', autoDeduct: false, renewal: null,
    ...p,
  }
}

describe('upcomingBills', () => {
  test('includes subs renewing within the window, soonest first', () => {
    const subs = [
      sub({ id: 'a', renewal: isoOffset(10) }),
      sub({ id: 'b', renewal: isoOffset(2) }),
    ]
    const bills = upcomingBills(subs, 30)
    expect(bills.map(b => b.id)).toEqual(['b', 'a'])
    expect(bills[0].daysUntil).toBe(2)
    expect(bills[1].daysUntil).toBe(10)
  })

  test('rolls a past monthly anchor forward to the next cycle', () => {
    const subs = [sub({ id: 'c', period: 'monthly', renewal: isoOffset(-40) })]
    const bills = upcomingBills(subs, 60)
    expect(bills).toHaveLength(1)
    expect(bills[0].daysUntil).toBeGreaterThanOrEqual(0)
    expect(bills[0].daysUntil).toBeLessThanOrEqual(60)
  })

  test('excludes subs with no renewal date and those beyond the window', () => {
    const subs = [
      sub({ id: 'd', renewal: null }),
      sub({ id: 'e', renewal: isoOffset(90) }),
    ]
    expect(upcomingBills(subs, 30)).toEqual([])
  })

  test('amountCHF is the per-charge amount, not the monthly-equivalent', () => {
    const subs = [sub({ id: 'f', amountCHF: 120, period: 'yearly', renewal: isoOffset(5) })]
    const bills = upcomingBills(subs, 30)
    expect(bills[0].amountCHF).toBe(120)
  })

  test('a renewal exactly today is included with daysUntil 0', () => {
    const bills = upcomingBills([sub({ id: 'g', renewal: isoOffset(0) })], 30)
    expect(bills).toHaveLength(1)
    expect(bills[0].daysUntil).toBe(0)
  })
})

/**
 * Phase 5 feature 2 — subscription alerts. Locks trial-ending detection
 * (within window, future only) and price-hike detection (increase only, recent
 * only, sorted after trials). Dates are relative to real "today" so it stays
 * deterministic.
 */
import { subscriptionAlerts } from '@/app/app/finance/state'
import type { Subscription } from '@/app/app/finance/types'

const DAY = 86_400_000

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

describe('subscriptionAlerts', () => {
  test('flags a trial ending within the window', () => {
    const a = subscriptionAlerts([sub({ id: 'a', trialEnds: isoOffset(3) })], 14)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'a', kind: 'trial', daysUntil: 3 })
  })

  test('ignores a trial beyond the window or already past', () => {
    expect(subscriptionAlerts([sub({ id: 'b', trialEnds: isoOffset(40) })], 14)).toEqual([])
    expect(subscriptionAlerts([sub({ id: 'c', trialEnds: isoOffset(-2) })], 14)).toEqual([])
  })

  test('flags a recent price increase but not a decrease', () => {
    const up = sub({ id: 'd', amountCHF: 18, previousAmountCHF: 12, priceChangedAt: Date.now() })
    const down = sub({ id: 'e', amountCHF: 8, previousAmountCHF: 12, priceChangedAt: Date.now() })
    const a = subscriptionAlerts([up, down])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'd', kind: 'hike', fromCHF: 12, toCHF: 18 })
  })

  test('ignores a stale price change beyond the recency window', () => {
    const old = sub({ id: 'f', amountCHF: 18, previousAmountCHF: 12, priceChangedAt: Date.now() - 90 * DAY })
    expect(subscriptionAlerts([old], 14, 60)).toEqual([])
  })

  test('trials sort before hikes', () => {
    const subs = [
      sub({ id: 'h', amountCHF: 18, previousAmountCHF: 12, priceChangedAt: Date.now() }),
      sub({ id: 't', trialEnds: isoOffset(2) }),
    ]
    expect(subscriptionAlerts(subs).map(x => x.kind)).toEqual(['trial', 'hike'])
  })
})

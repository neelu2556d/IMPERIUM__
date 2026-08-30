/**
 * New finance features: debt (true net worth = assets − debt), months-of-runway,
 * live-crypto value math, income/cash-flow split in the monthly recap, and the
 * crypto coin resolver. A fixed `now` keeps month-bucketing deterministic.
 */
import {
  netWorthChf,
  assetsChf,
  debtChf,
  netWorthByType,
  runwayMonths,
  cryptoValueChf,
  monthlyRecap,
  categoryBreakdown,
  processRenewals,
  projectGoalDate,
} from '@/app/app/finance/state'
import { resolveCoin, symbolForId } from '@/app/app/finance/coins'
import type { Account, Order, Subscription, CryptoQuote, FinanceState, NwHistoryPoint } from '@/app/app/finance/types'

const NOW = new Date(2026, 5, 13) // Jun 13 2026 (local)
const thisMonth = (day: number) => new Date(2026, 5, day).getTime()
const lastMonth = (day: number) => new Date(2026, 4, day).getTime()
const daysAgo = (n: number) => NOW.getTime() - n * 86_400_000

function acct(p: Partial<Account> & { id: string; type: Account['type']; amountCHF: number }): Account {
  return { name: 'x', ...p }
}
function order(p: Partial<Order> & { id: string; ts: number }): Order {
  return {
    name: 'thing', amountCHF: 10, fromAccountId: null, date: null,
    deductedAt: null, pctAtDeduction: null, deductedFromName: null,
    ...p,
  }
}
function sub(p: Partial<Subscription> & { id: string; amountCHF: number }): Subscription {
  return { name: 'sub', period: 'monthly', autoDeduct: false, ...p }
}

describe('debt → true net worth', () => {
  const accounts: Account[] = [
    acct({ id: 'a', type: 'bank', amountCHF: 5000 }),
    acct({ id: 'b', type: 'stocks', amountCHF: 3000 }),
    acct({ id: 'c', type: 'debt', amountCHF: 2000 }),   // credit card
    acct({ id: 'd', type: 'debt', amountCHF: 1000 }),   // loan
  ]

  test('netWorthChf subtracts debt from assets', () => {
    expect(netWorthChf(accounts)).toBe(5000) // 8000 assets − 3000 debt
  })

  test('assetsChf and debtChf split cleanly', () => {
    expect(assetsChf(accounts)).toBe(8000)
    expect(debtChf(accounts)).toBe(3000)
  })

  test('netWorthByType tracks debt as a positive magnitude', () => {
    const byType = netWorthByType(accounts)
    expect(byType.debt).toBe(3000)
    expect(byType.bank).toBe(5000)
  })
})

describe('runwayMonths', () => {
  test('liquid cash ÷ (subs + last-30-day spend)', () => {
    const accounts = [acct({ id: 'a', type: 'bank', amountCHF: 6000 })]
    const subs = [sub({ id: 's', amountCHF: 1000 })] // 1000/mo
    const orders = [order({ id: 'o', ts: daysAgo(5), amountCHF: 500 })] // recent spend
    // burn = 1000 + 500 = 1500 → 6000 / 1500 = 4 months
    expect(runwayMonths(accounts, subs, orders, NOW)).toBeCloseTo(4)
  })

  test('ignores income and spend older than 30 days', () => {
    const accounts = [acct({ id: 'a', type: 'bank', amountCHF: 3000 })]
    const subs = [sub({ id: 's', amountCHF: 1000 })]
    const orders = [
      order({ id: 'i', ts: daysAgo(2), amountCHF: 9999, direction: 'in' }), // income — ignored
      order({ id: 'old', ts: daysAgo(60), amountCHF: 9999 }),               // too old — ignored
    ]
    // burn = 1000 only → 3000 / 1000 = 3 months
    expect(runwayMonths(accounts, subs, orders, NOW)).toBeCloseTo(3)
  })

  test('null when there is no cash or no burn', () => {
    expect(runwayMonths([], [], [], NOW)).toBeNull()
    expect(runwayMonths([acct({ id: 'a', type: 'bank', amountCHF: 1000 })], [], [], NOW)).toBeNull()
  })
})

describe('cryptoValueChf', () => {
  const q: CryptoQuote = { coinId: 'bitcoin', priceCHF: 50000, changePct: 1, fetchedAt: 0 }
  test('quantity × CHF price', () => {
    expect(cryptoValueChf(0.5, q)).toBe(25000)
  })
  test('0 when no quote or non-positive quantity', () => {
    expect(cryptoValueChf(0.5, undefined)).toBe(0)
    expect(cryptoValueChf(0, q)).toBe(0)
  })
})

describe('monthlyRecap income/cash-flow split', () => {
  test('income is excluded from spend and surfaced as cash flow', () => {
    const orders = [
      order({ id: 'a', ts: thisMonth(2), amountCHF: 100, name: 'Coop' }),          // spend
      order({ id: 'b', ts: thisMonth(9), amountCHF: 300, direction: 'in', name: 'Paycheck' }),
      order({ id: 'c', ts: lastMonth(5), amountCHF: 50 }),                          // spend
      order({ id: 'd', ts: lastMonth(6), amountCHF: 200, direction: 'in' }),
    ]
    const r = monthlyRecap(orders, NOW)
    expect(r.thisMonthCHF).toBe(100)            // spend only
    expect(r.thisMonthIncomeCHF).toBe(300)
    expect(r.lastMonthCHF).toBe(50)
    expect(r.lastMonthIncomeCHF).toBe(200)
    expect(r.netCHF).toBe(200)                  // 300 in − 100 out
    expect(r.count).toBe(1)                      // spend count, income not counted
  })

  test('categoryBreakdown ignores income entries', () => {
    const orders = [
      order({ id: 'a', ts: thisMonth(2), amountCHF: 100, name: 'Migros groceries' }),
      order({ id: 'b', ts: thisMonth(3), amountCHF: 9999, direction: 'in', name: 'Salary' }),
    ]
    const cats = categoryBreakdown(orders, NOW)
    const total = cats.reduce((s, c) => s + c.total, 0)
    expect(total).toBe(100) // income excluded
    expect(cats.find(c => c.category === 'groceries')?.total).toBe(100)
  })
})

function makeState(p: Partial<FinanceState>): FinanceState {
  return {
    version: 1, currency: 'CHF', activeTab: 'net',
    accounts: [], subscriptions: [], orders: [], wishlist: [],
    activity: [], netWorthHistory: [], ...p,
  }
}

describe('processRenewals (auto-deduct on renewal)', () => {
  const dueSub = (over: Partial<Subscription> = {}): Subscription => sub({
    id: 's', name: 'Netflix', amountCHF: 50, period: 'monthly',
    autoDeduct: true, fromAccountId: 'acc1', renewal: '2026-06-12', lastDeductedAt: null, ...over,
  })

  test('debits the account, rolls renewal forward, stamps lastDeductedAt, logs it', () => {
    const state = makeState({
      accounts: [acct({ id: 'acc1', type: 'bank', name: 'Checking', amountCHF: 1000 })],
      subscriptions: [dueSub()],
    })
    const next = processRenewals(state, NOW)
    expect(next.accounts[0].amountCHF).toBe(950)
    expect(next.subscriptions[0].renewal).toBe('2026-07-12') // next future occurrence
    expect(next.subscriptions[0].lastDeductedAt).toBe(NOW.getTime())
    expect(next.activity).toHaveLength(1)
    expect(next.activity[0].deltaCHF).toBe(-50)
  })

  test('idempotent — a second pass does not double-charge', () => {
    const state = makeState({
      accounts: [acct({ id: 'acc1', type: 'bank', amountCHF: 1000 })],
      subscriptions: [dueSub()],
    })
    const once = processRenewals(state, NOW)
    const twice = processRenewals(once, NOW)
    expect(twice.accounts[0].amountCHF).toBe(950) // unchanged
    expect(twice).toBe(once)                       // no-op returns same reference
  })

  test('leaves future / non-auto / already-deducted subs alone', () => {
    const state = makeState({
      accounts: [acct({ id: 'acc1', type: 'bank', amountCHF: 1000 })],
      subscriptions: [
        dueSub({ id: 'future', renewal: '2026-07-01' }),               // not due yet
        dueSub({ id: 'manual', autoDeduct: false }),                   // not auto
        dueSub({ id: 'done', lastDeductedAt: new Date(2026, 5, 12).getTime() }), // already done
      ],
    })
    const next = processRenewals(state, NOW)
    expect(next).toBe(state) // nothing changed
    expect(next.accounts[0].amountCHF).toBe(1000)
  })
})

describe('projectGoalDate', () => {
  const DAY = 86_400_000
  const NOW_MS = new Date(2026, 5, 13).getTime()

  test('extrapolates the recent slope to an ETA', () => {
    const history: NwHistoryPoint[] = [
      { t: NOW_MS - 30 * DAY, v: 1000 },
      { t: NOW_MS, v: 4000 }, // +100/day
    ]
    const date = projectGoalDate(history, 10000, NOW_MS) // need +6000 at 100/day = 60 days
    expect(date).not.toBeNull()
    expect(Math.round((date!.getTime() - NOW_MS) / DAY)).toBe(60)
  })

  test('null when flat/declining, already there, or too little history', () => {
    const flat: NwHistoryPoint[] = [{ t: NOW_MS - 30 * DAY, v: 5000 }, { t: NOW_MS, v: 5000 }]
    expect(projectGoalDate(flat, 10000, NOW_MS)).toBeNull()
    const there: NwHistoryPoint[] = [{ t: NOW_MS - 30 * DAY, v: 1000 }, { t: NOW_MS, v: 9999 }]
    expect(projectGoalDate(there, 9000, NOW_MS)).toBeNull() // already past goal
    expect(projectGoalDate([{ t: NOW_MS, v: 1000 }], 5000, NOW_MS)).toBeNull() // <2 points
  })
})

describe('coin resolver', () => {
  test('resolves by symbol, id, or name', () => {
    expect(resolveCoin('btc')?.id).toBe('bitcoin')
    expect(resolveCoin('Bitcoin')?.id).toBe('bitcoin')
    expect(resolveCoin('ethereum')?.symbol).toBe('ETH')
    expect(resolveCoin('SOL')?.id).toBe('solana')
  })
  test('returns null for unknown coins', () => {
    expect(resolveCoin('notacoin')).toBeNull()
    expect(resolveCoin('')).toBeNull()
  })
  test('symbolForId maps id back to display symbol', () => {
    expect(symbolForId('bitcoin')).toBe('BTC')
    expect(symbolForId('unknown-coin')).toBe('UNKNOWN-COIN')
  })
})

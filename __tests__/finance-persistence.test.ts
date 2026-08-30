/**
 * BUILD13 — finance Supabase persistence: pure-logic locks.
 *
 * The DB integration itself can't run here (auth-gated + no test DB), but the
 * row mappers, the localStorage->Supabase id remap, and the diff are pure and
 * are exactly where a silent field-name / date-conversion typo would corrupt
 * data. These lock the round-trips.
 */
import { __financeInternals, genId, newUuid } from '@/app/app/finance/state'
import type { Account, Order, Subscription } from '@/app/app/finance/types'

const {
  accountToRow, rowToAccount,
  orderToRow, rowToOrder,
  subToRow, rowToSub,
  toUuid, diffById,
} = __financeInternals

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('finance persistence mappers', () => {
  test('account round-trips through its DB row form', () => {
    const a: Account = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      type: 'stocks', name: 'VTI', amountCHF: 1234.5,
      ticker: 'VTI', shares: 10, priceHistory: [{ t: 1000, p: 200 }],
    }
    expect(rowToAccount(accountToRow(a, 'u1'))).toEqual(a)
  })

  test('order maps ts<->created_at and date<->arrival_date', () => {
    const o: Order = {
      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      name: 'Shoes', amountCHF: 99, fromAccountId: null,
      date: '2026-07-01', ts: 1718000000000,
      deductedAt: null, pctAtDeduction: null, deductedFromName: null,
    }
    const round = rowToOrder(orderToRow(o, 'u1'))
    expect(round.ts).toBe(o.ts)
    expect(round.date).toBe('2026-07-01')
    expect(round.amountCHF).toBe(99)
    expect(round.deductedAt).toBeNull()
  })

  test('subscription preserves period, autoDeduct, lastDeductedAt', () => {
    const s: Subscription = {
      id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      name: 'Netflix', amountCHF: 18, period: 'monthly',
      autoDeduct: true, fromAccountId: null,
      lastDeductedAt: 1718000000000, renewal: '2026-08-01',
    }
    const round = rowToSub(subToRow(s, 'u1'))
    expect(round.period).toBe('monthly')
    expect(round.autoDeduct).toBe(true)
    expect(round.lastDeductedAt).toBe(1718000000000)
    expect(round.renewal).toBe('2026-08-01')
  })

  test('toUuid strips a prefix that wraps a uuid, leaves a bare uuid alone', () => {
    expect(toUuid('acc_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'))
      .toBe('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
    expect(toUuid('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'))
      .toBe('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
  })

  test('toUuid generates a fresh uuid for a legacy non-uuid id', () => {
    expect(toUuid('acc_169abc_xyz')).toMatch(UUID)
  })

  test('diffById detects changed + new (upsert) and removed (delete)', () => {
    const prev = [{ id: 'x', name: 'a' }, { id: 'y', name: 'b' }]
    const curr = [{ id: 'x', name: 'A' }, { id: 'z', name: 'c' }]
    const { upserts, deleteIds } = diffById(prev, curr, e => ({ id: e.id, name: e.name }))
    expect(upserts).toEqual([{ id: 'x', name: 'A' }, { id: 'z', name: 'c' }])
    expect(deleteIds).toEqual(['y'])
  })

  test('diffById is a no-op when nothing changed', () => {
    const rows = [{ id: 'x', name: 'a' }]
    const { upserts, deleteIds } = diffById(rows, rows, e => ({ id: e.id, name: e.name }))
    expect(upserts).toEqual([])
    expect(deleteIds).toEqual([])
  })

  test('genId / newUuid produce valid bare uuids (fit the uuid columns)', () => {
    expect(genId('acc')).toMatch(UUID)
    expect(newUuid()).toMatch(UUID)
  })
})

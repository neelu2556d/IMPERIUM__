import { greenLight, type DomainConcern, type ActiveGoal } from '@/lib/oracle/greenlight'

// The convergence brain behind "Vitality noticed". It only turns the light green
// when at least two independent, already-gated domains are concerned AND the
// convergence is anchored to one of the user's active goals. A lone signal, or a
// pile of signals with no goal at stake, stays dark. This is the guard against
// generic scolding ("who does Vitality think it is").

const trainStall = (goalRefs: string[] = ['g_bench'], margin = 2): DomainConcern => ({
  domain: 'train',
  receipt: { kind: 'lift-stall', text: 'bench top set 180 unchanged across 3 sessions over 9 days', dates: ['2026-06-07', '2026-06-18'] },
  goalRefs,
  margin,
})
const fuelQuiet = (goalRefs: string[] = ['g_bench'], margin = 1): DomainConcern => ({
  domain: 'fuel',
  receipt: { kind: 'fuel-quiet', text: 'macros logged 1 of the last 6 days' },
  goalRefs,
  margin,
})
const recoveryDip = (margin = 1): DomainConcern => ({
  domain: 'recovery',
  receipt: { kind: 'recovery-dip', text: 'recovery down 14 points this week' },
  goalRefs: [],
  margin,
})

const benchGoal: ActiveGoal = { id: 'g_bench', title: 'bench 225', push: 'normal' }

describe('greenLight', () => {
  test('stays dark with fewer than two concerned domains', () => {
    expect(greenLight([trainStall()], [benchGoal])).toBeNull()
  })

  test('stays dark when no concern is anchored to an active goal', () => {
    // two domains concerned, but neither references a real goal
    expect(greenLight([trainStall([]), recoveryDip()], [benchGoal])).toBeNull()
  })

  test('a silent goal can never anchor the light', () => {
    const silent: ActiveGoal = { id: 'g_bench', title: 'bench 225', push: 'silent' }
    expect(greenLight([trainStall(['g_bench']), recoveryDip()], [silent])).toBeNull()
  })

  test('fires when two domains converge on an active goal', () => {
    const c = greenLight([trainStall(['g_bench'], 2), recoveryDip(1)], [benchGoal])
    expect(c).not.toBeNull()
    expect(c!.domainsHit).toEqual(['recovery', 'train']) // sorted, deterministic
    expect(c!.goal.id).toBe('g_bench')
    expect(c!.patternKey).toBe('recovery+train')
    expect(c!.confidence).toBe(3) // sum of margins
    expect(c!.receipts.map((r) => r.kind)).toContain('lift-stall')
    expect(c!.receipts.map((r) => r.kind)).toContain('recovery-dip')
  })

  test('tone is gentle for a normal goal and direct for a push goal', () => {
    const gentle = greenLight([trainStall(['g_bench']), recoveryDip()], [benchGoal])
    expect(gentle!.suggestedTone).toBe('gentle')
    const push = greenLight([trainStall(['g_bench']), recoveryDip()], [{ ...benchGoal, push: 'push' }])
    expect(push!.suggestedTone).toBe('direct')
  })

  test('anchors to the most-referenced active goal when several are at stake', () => {
    const leanGoal: ActiveGoal = { id: 'g_lean', title: 'get lean', push: 'normal' }
    // bench referenced by 2 concerns, lean by 1 -> bench wins the anchor
    const c = greenLight(
      [trainStall(['g_bench']), fuelQuiet(['g_bench', 'g_lean'])],
      [benchGoal, leanGoal],
    )
    expect(c!.goal.id).toBe('g_bench')
  })

  test('caps receipts so the card never becomes a wall', () => {
    const c = greenLight(
      [trainStall(['g_bench'], 4), fuelQuiet(['g_bench'], 3), recoveryDip(2), { domain: 'mood', receipt: { kind: 'mood-low', text: 'mood trending low' }, goalRefs: [], margin: 1 }],
      [benchGoal],
      { maxReceipts: 3 },
    )
    expect(c!.receipts).toHaveLength(3)
    // keeps the highest-margin receipts
    expect(c!.receipts.map((r) => r.kind)).toEqual(['lift-stall', 'fuel-quiet', 'recovery-dip'])
  })
})

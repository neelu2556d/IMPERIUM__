import { liftStall } from '@/mcp/src/insights'

// The per-lift stall detector — the gate behind "your bench has sat at 180".
// Pure: takes one lift's top-set-by-date series, returns whether it has plateaued.
// Honesty matters here: rep progress at the same weight is NOT a stall, and an
// off / sick day never counts as progress or extends a plateau.

describe('liftStall', () => {
  test('null when there are fewer than the minimum sessions to judge', () => {
    expect(liftStall([])).toBeNull()
    expect(
      liftStall([
        { date: '2026-06-01', topWeight: 180, topReps: 5 },
        { date: '2026-06-08', topWeight: 180, topReps: 5 },
      ]),
    ).toBeNull()
  })

  test('not stalled while the lift is climbing (a new best each session)', () => {
    const r = liftStall([
      { date: '2026-06-01', topWeight: 170, topReps: 5 },
      { date: '2026-06-08', topWeight: 175, topReps: 5 },
      { date: '2026-06-15', topWeight: 180, topReps: 5 },
    ])
    expect(r).not.toBeNull()
    expect(r!.isStalled).toBe(false)
    expect(r!.stalledSessions).toBe(0)
    expect(r!.lastProgressDate).toBe('2026-06-15')
  })

  test('stalled when the top set has not moved for enough sessions over enough days', () => {
    const r = liftStall([
      { date: '2026-06-01', topWeight: 170, topReps: 5 },
      { date: '2026-06-04', topWeight: 175, topReps: 5 },
      { date: '2026-06-07', topWeight: 180, topReps: 5 }, // last real progress
      { date: '2026-06-10', topWeight: 180, topReps: 5 },
      { date: '2026-06-14', topWeight: 180, topReps: 4 },
      { date: '2026-06-18', topWeight: 180, topReps: 5 },
    ])
    expect(r).not.toBeNull()
    expect(r!.isStalled).toBe(true)
    expect(r!.plateauWeight).toBe(180)
    expect(r!.lastProgressDate).toBe('2026-06-07')
    expect(r!.stalledSessions).toBe(3)
    expect(r!.stalledDays).toBe(11)
    expect(r!.nSessions).toBe(6)
  })

  test('rep progress at the same weight is progress, not a stall (uses estimated 1RM)', () => {
    const r = liftStall([
      { date: '2026-06-01', topWeight: 180, topReps: 5 },
      { date: '2026-06-08', topWeight: 180, topReps: 6 },
      { date: '2026-06-15', topWeight: 180, topReps: 7 },
    ])
    expect(r!.isStalled).toBe(false)
    expect(r!.lastProgressDate).toBe('2026-06-15')
  })

  test('off / sick day sessions are ignored (never count as progress or data)', () => {
    const r = liftStall([
      { date: '2026-06-01', topWeight: 170, topReps: 5 },
      { date: '2026-06-04', topWeight: 175, topReps: 5 },
      { date: '2026-06-07', topWeight: 180, topReps: 5 }, // last real progress
      { date: '2026-06-10', topWeight: 180, topReps: 5 },
      { date: '2026-06-14', topWeight: 180, topReps: 5 },
      { date: '2026-06-18', topWeight: 185, topReps: 5, offDay: true }, // would be a PR, but off-day → ignored
    ])
    expect(r!.nSessions).toBe(5)
    expect(r!.isStalled).toBe(true)
    expect(r!.plateauWeight).toBe(180)
    expect(r!.lastProgressDate).toBe('2026-06-07')
    expect(r!.stalledDays).toBe(7)
  })

  test('order independent: newest-first input gives the same verdict', () => {
    const newestFirst = liftStall([
      { date: '2026-06-18', topWeight: 180, topReps: 5 },
      { date: '2026-06-14', topWeight: 180, topReps: 4 },
      { date: '2026-06-10', topWeight: 180, topReps: 5 },
      { date: '2026-06-07', topWeight: 180, topReps: 5 },
      { date: '2026-06-04', topWeight: 175, topReps: 5 },
      { date: '2026-06-01', topWeight: 170, topReps: 5 },
    ])
    expect(newestFirst!.isStalled).toBe(true)
    expect(newestFirst!.plateauWeight).toBe(180)
    expect(newestFirst!.stalledSessions).toBe(3)
    expect(newestFirst!.lastProgressDate).toBe('2026-06-07')
  })
})

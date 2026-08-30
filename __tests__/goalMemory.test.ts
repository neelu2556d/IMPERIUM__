import { goalMemoryAction, goalFactBody } from '@/lib/goals/goalMemory'
import type { BigGoal } from '@/app/app/goals/veeTypes'

// A plain active, medium-priority, balanced-push goal with no progress/date.
const base: BigGoal = {
  id: 'g1',
  title: 'Run a half marathon',
  cleanTitle: null,
  category: null,
  targetDate: null,
  priority: 2,
  push: 'balanced',
  progressCurrent: null,
  progressTarget: null,
  progressUnit: null,
  identityTag: null,
  status: 'active',
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  achievedAt: null,
}

describe('goalMemoryAction — Vee remembers exactly what the goal currently is', () => {
  it('a silent goal is private: write nothing, ever', () => {
    expect(goalMemoryAction({ ...base, push: 'silent' })).toEqual({ op: 'delete' })
    // silent wins even when achieved
    expect(goalMemoryAction({ ...base, push: 'silent', status: 'achieved' })).toEqual({ op: 'delete' })
  })

  it('a paused or abandoned goal retracts the memory (Vee goes quiet about it)', () => {
    expect(goalMemoryAction({ ...base, status: 'paused' })).toEqual({ op: 'delete' })
    expect(goalMemoryAction({ ...base, status: 'abandoned' })).toEqual({ op: 'delete' })
  })

  it('an active goal writes a working-toward fact at priority salience', () => {
    const a = goalMemoryAction(base)
    expect(a.op).toBe('write')
    if (a.op !== 'write') return
    expect(a.salience).toBe(0.6) // medium
    expect(a.body).toContain('Personal goal: Run a half marathon.')
    expect(a.body).toContain('Medium priority.')
    expect(a.body).toContain('Wants Vee to nudge them if they drift.')
    // no date / no progress phrasing when those are absent
    expect(a.body).not.toMatch(/Target date/)
    expect(a.body).not.toMatch(/ of /)
  })

  it('salience tracks priority (low 0.45, high 0.8)', () => {
    const lo = goalMemoryAction({ ...base, priority: 1 })
    const hi = goalMemoryAction({ ...base, priority: 3 })
    expect(lo.op === 'write' && lo.salience).toBe(0.45)
    expect(hi.op === 'write' && hi.salience).toBe(0.8)
  })

  it('includes the deadline and live progress when present', () => {
    const a = goalMemoryAction({
      ...base, priority: 3, push: 'push', targetDate: '2026-09-01',
      progressCurrent: 640, progressTarget: 1000, progressUnit: 'subs',
    })
    if (a.op !== 'write') throw new Error('expected write')
    expect(a.body).toContain('Target date 2026-09-01.')
    expect(a.body).toContain('At 640 of 1000 subs.')
    expect(a.body).toContain('High priority.')
    expect(a.body).toContain('Wants Vee to push them to show up.')
  })

  it('progress with no target is treated as milestone-style (no count phrase)', () => {
    const a = goalMemoryAction({ ...base, progressCurrent: 3, progressTarget: null })
    if (a.op !== 'write') throw new Error('expected write')
    expect(a.body).not.toMatch(/ of /)
  })

  it('an achieved goal writes a celebration fact at high salience', () => {
    const a = goalMemoryAction({ ...base, status: 'achieved', push: 'gentle' })
    if (a.op !== 'write') throw new Error('expected write')
    expect(a.salience).toBe(0.9)
    expect(a.body).toContain('Achieved their goal: Run a half marathon.')
    expect(a.body).toContain('celebrat')
  })

  it('prefers the AI clean title when present', () => {
    const a = goalMemoryAction({ ...base, cleanTitle: 'Run a Half Marathon' })
    if (a.op !== 'write') throw new Error('expected write')
    expect(a.body).toContain('Personal goal: Run a Half Marathon.')
  })
})

describe('goalFactBody', () => {
  it('builds the canonical working-toward line', () => {
    expect(goalFactBody({ ...base, cleanTitle: null }))
      .toBe('Personal goal: Run a half marathon. Medium priority. Wants Vee to nudge them if they drift.')
  })
})

/**
 * Tests for the Vitals Signal engine (lib/vitals/signal.ts) — the pure function
 * that fuses WHOOP recovery + training load + fuel + the goal + what the user
 * told Vee into one daily lean (push / steady / recover). Deterministic, no IO,
 * never throws. Run with:
 *   npx jest signal --testPathIgnorePatterns "/node_modules/"
 */

import { computeSignal, type SignalInput } from '@/lib/vitals/signal'

const base = (over: Partial<SignalInput> = {}): SignalInput => ({
  recovery: 70,
  sleepPerf: 85,
  hrv: 60,
  strain: 12,
  weekHadData: true,
  hardDays7: 1,
  trainTargetPerWeek: 4,
  trainedToday: false,
  daysSinceHardTrain: 2,
  fuel: { kcal: 2200, kcalTarget: 2400, protein: 160, proteinTarget: 180 },
  injuryFlags: [],
  goalLabel: null,
  goalPct: null,
  goalTrend: null,
  confidence: 'trusted',
  gentlePace: false,
  ...over,
})

describe('computeSignal', () => {
  it('returns null when there is no data at all', () => {
    expect(computeSignal(base({ recovery: null, weekHadData: false }))).toBeNull()
  })

  it('high recovery + fresh + fuelled leans push', () => {
    const s = computeSignal(base({ recovery: 82, hardDays7: 1, trainedToday: false }))
    expect(s).not.toBeNull()
    expect(s!.lean).toBe('push')
    expect(s!.tone).toBe('accent')
    expect(s!.badge).toBe('Ready to push')
  })

  it('low recovery leans recover with amber tone', () => {
    const s = computeSignal(base({ recovery: 22 }))
    expect(s!.lean).toBe('recover')
    expect(s!.tone).toBe('amber')
    expect(s!.badge).toBe('Active recovery')
  })

  it('moderate recovery leans steady', () => {
    const s = computeSignal(base({ recovery: 50 }))
    expect(s!.lean).toBe('steady')
  })

  it('an injury flag caps a would-be push at steady', () => {
    const s = computeSignal(base({ recovery: 85, injuryFlags: ['right shoulder'] }))
    expect(s!.lean).not.toBe('push')
    expect(s!.lean).toBe('steady')
    // injury surfaces a Vee chip
    expect(s!.chips.some(c => c.source === 'Vee' && c.dir === 'warn')).toBe(true)
  })

  it('an injury on a low day stays recover and protects the flag in copy', () => {
    const s = computeSignal(base({ recovery: 20, injuryFlags: ['left knee'] }))
    expect(s!.lean).toBe('recover')
    expect(s!.verdict.toLowerCase()).toContain('left knee')
  })

  it('under-fuelled biases a moderate day toward recover', () => {
    const moderate = computeSignal(base({ recovery: 50, fuel: { kcal: 2200, kcalTarget: 2400, protein: 160, proteinTarget: 180 } }))
    expect(moderate!.lean).toBe('steady')
    const under = computeSignal(base({ recovery: 50, fuel: { kcal: 1000, kcalTarget: 2400, protein: 60, proteinTarget: 180 } }))
    expect(under!.lean).toBe('recover')
    expect(under!.chips.some(c => c.source === 'Fuel' && c.dir === 'warn')).toBe(true)
  })

  it('heavy recent load softens a moderate day toward recover', () => {
    const s = computeSignal(base({ recovery: 50, hardDays7: 5, trainTargetPerWeek: 4, trainedToday: true }))
    expect(s!.lean).toBe('recover')
    expect(s!.chips.some(c => c.source === 'Train' && c.dir === 'down')).toBe(true)
  })

  it('gentle pace never auto-pushes from a steady read', () => {
    // recovery would be steady; gentle pace keeps it from ever climbing.
    const s = computeSignal(base({ recovery: 50, gentlePace: true }))
    expect(s!.lean).not.toBe('push')
  })

  it('omits source chips that have no data', () => {
    const s = computeSignal(base({
      recovery: 70, sleepPerf: null, trainTargetPerWeek: 0, fuel: null, injuryFlags: [],
    }))
    const sources = s!.chips.map(c => c.source)
    expect(sources).toContain('WHOOP')
    expect(sources).not.toContain('Train')
    expect(sources).not.toContain('Fuel')
    expect(sources).not.toContain('Vee')
  })

  it('builds a goal momentum line with trend word when a goal is present', () => {
    const s = computeSignal(base({ goalLabel: 'more recovered', goalPct: 0.68, goalTrend: 'up' }))
    expect(s!.goalLine).toBe('68% to more recovered, climbing')
  })

  it('has no goal line when no goal is set', () => {
    expect(computeSignal(base())!.goalLine).toBeNull()
  })

  it('never emits an em dash or en dash in copy', () => {
    const s = computeSignal(base({ recovery: 20, injuryFlags: ['right shoulder'] }))!
    const allCopy = [s.badge, s.verdict, s.why, s.goalLine ?? ''].join(' ')
    expect(allCopy).not.toMatch(/[—–]/)
  })
})

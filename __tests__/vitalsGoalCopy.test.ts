/**
 * Tests for goalCopy (lib/vitals/goalCopy.ts). Pure, deterministic.
 * Run with: npx jest vitalsGoalCopy --testPathIgnorePatterns "/node_modules/"
 */
import { goalCopy } from '@/lib/vitals/goalCopy'
import type { VitalsGoal } from '@/lib/vitals/goals'

const g = (over: Partial<VitalsGoal> = {}): VitalsGoal => ({
  metric: 'recovery', direction: 'up', baselineValue: 55, targetValue: 63,
  windowDays: 28, confidence: 'trusted', isProvisional: false, sourceLimiter: 'energy', ...over,
})

describe('goalCopy', () => {
  it('gives plain-english title + label per metric, all lowercase, no em dash', () => {
    const c = goalCopy(g({ metric: 'recovery', sourceLimiter: 'energy' }))
    expect(c.title).toBe('wake up more recovered')
    expect(c.badgeLabel).toBe('more recovered')
    expect(c.metricLabel).toBe('recovery')
    expect(c.title).toBe(c.title.toLowerCase())
    expect(c.title + c.why).not.toMatch(/[—–]/)
  })
  it('hold goals read as maintain, not climb', () => {
    expect(goalCopy(g({ direction: 'hold' })).why.toLowerCase()).toMatch(/hold|keep|stay|maintain/)
  })
  it('covers every metric without throwing', () => {
    for (const m of ['recovery', 'sleep', 'hrv', 'strain'] as const) {
      expect(() => goalCopy(g({ metric: m }))).not.toThrow()
      expect(goalCopy(g({ metric: m })).badgeLabel.length).toBeGreaterThan(0)
    }
  })
})

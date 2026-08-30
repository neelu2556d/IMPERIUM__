/**
 * Tests for the adaptive goal-band deserialization + backfill in rowToGoals
 * (app/app/fuel/macros/serialize.ts). The band is persisted on nutrition_goals
 * when the migration has run; otherwise it backfills from goal_outcome via the
 * engine's goalBandFor, so every account has a correct lane immediately.
 */

import { rowToGoals, DEFAULT_GOALS, type GoalsRow } from '@/app/app/fuel/macros/serialize'
import { goalBandFor } from '@/lib/nutrition/adaptive'

const LB = 0.453592

// Minimal valid row (only the always-present BUILD25 columns set).
function row(extra: Partial<GoalsRow> = {}): GoalsRow {
  return {
    kcal_target: 2400,
    protein_target: 180,
    carbs_target: 250,
    fat_target: 70,
    search_mode: 'basic',
    onboarded: true,
    ...extra,
  }
}

describe('rowToGoals — adaptive band', () => {
  it('prefers the persisted band columns when present', () => {
    const g = rowToGoals(row({ goal_outcome: 'CUT', goal_rate_low_kg_wk: -0.3, goal_rate_high_kg_wk: -0.1 }))
    expect(g.goalBand).toEqual({ lowKgPerWeek: -0.3, highKgPerWeek: -0.1 })
  })

  it('backfills the band from goal_outcome when the columns are absent (older account)', () => {
    const g = rowToGoals(row({ goal_outcome: 'CUT' }))
    expect(g.goalBand.lowKgPerWeek).toBeCloseTo(-1.0 * LB, 4)
    expect(g.goalBand.highKgPerWeek).toBeCloseTo(-0.5 * LB, 4)
    expect(g.goalBand).toEqual(goalBandFor('CUT'))
  })

  it('falls back to the maintain lane when there is no goal_outcome at all', () => {
    const g = rowToGoals(row({ goal_outcome: null }))
    expect(g.goalBand).toEqual(goalBandFor(''))
  })

  it('defaults adaptiveEnabled to true when the column is absent, and honors false', () => {
    expect(rowToGoals(row()).adaptiveEnabled).toBe(true)
    expect(rowToGoals(row({ adaptive_enabled: false })).adaptiveEnabled).toBe(false)
  })

  it('DEFAULT_GOALS (null row) carries a maintain band and adaptive on', () => {
    const g = rowToGoals(null)
    expect(g).toEqual(DEFAULT_GOALS)
    expect(g.goalBand).toEqual(goalBandFor(''))
    expect(g.adaptiveEnabled).toBe(true)
  })
})

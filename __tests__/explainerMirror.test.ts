/**
 * The mirror alarm for the Vitals explainer card (same guard pattern as the
 * reportContract mirror test): ExplainerCard's DEFAULT_INGREDIENTS is a static
 * copy of the score engine's subDefs, shown only before a user's first data.
 * Nothing at runtime ties the two lists together, so this spec pins them:
 * if an engine weight shifts or a label is renamed, this fails loudly instead
 * of the pre-first-data card quietly showing stale percentages.
 */
import { computeVitalsScore, type ScoreInput } from '@/lib/vitals/score'
import { DEFAULT_INGREDIENTS } from '@/components/vitals/ExplainerCard'

describe('ExplainerCard static ingredient mirror', () => {
  it('matches the engine subDefs: same labels, same order, same weights', () => {
    // A fully-populated dummy input so every sub is present in the output.
    const input: ScoreInput = {
      recovery: 60,
      sleepPerf: 80,
      hrv: 55,
      rhr: 52,
      sleepHours: 7.5,
      strain: 10,
      hrvBaseline: 50,
      rhrBaseline: 55,
      sleepTarget: 8,
    }
    const score = computeVitalsScore(input)
    expect(score).not.toBeNull()
    const engine = score!.subs.map(s => ({ label: s.label, weight: s.weight }))
    const mirror = DEFAULT_INGREDIENTS.map(d => ({ label: d.label, weight: d.weight }))
    expect(mirror).toEqual(engine)
  })

  it('detail lines key on labels that actually exist in the engine', () => {
    const input: ScoreInput = {
      recovery: 60, sleepPerf: 80, hrv: 55, rhr: 52, sleepHours: 7.5,
      strain: 10, hrvBaseline: 50, rhrBaseline: 55, sleepTarget: 8,
    }
    const engineLabels = new Set(computeVitalsScore(input)!.subs.map(s => s.label))
    for (const d of DEFAULT_INGREDIENTS.filter(d => d.detail)) {
      expect(engineLabels.has(d.label)).toBe(true)
    }
  })
})

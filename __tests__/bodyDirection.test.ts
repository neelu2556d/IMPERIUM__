/**
 * ONE direction inferrer (lib/goals/direction.ts) - and the proof the badge and
 * the sentence can never disagree again.
 *
 * The bug this locks out: ticker.ts and goalGuide.ts each had a private direction
 * inferrer with opposite precedence, so the SAME goal card could show a "drifting"
 * badge (ticker judged it a cut going up) next to a sentence praising "a lean
 * gaining pace" (guide judged it a gain). Both now import inferBodyDirection, and
 * the agreement tests below drive real goal cards through BOTH engines.
 */
import { inferBodyDirection } from '@/lib/goals/direction'
import { buildTicker, type TickerInput } from '@/lib/insights/ticker'
import { buildGoalGuide } from '@/lib/insights/goalGuide'

describe('inferBodyDirection - the one canon', () => {
  it('the goal\'s own words win over the profile fallback', () => {
    expect(inferBodyDirection('bulk up for winter', 'lose')).toBe('gain')
    expect(inferBodyDirection('cut to 80kg', 'gain')).toBe('lose')
  })

  it('gain words are checked first: "lean bulk" is a gain, never a cut', () => {
    expect(inferBodyDirection('lean bulk', 'lose')).toBe('gain')
    expect(inferBodyDirection('lean bulk', null)).toBe('gain')
  })

  it('a wordless title falls back to the profile, else null', () => {
    expect(inferBodyDirection('feel better this summer', 'lose')).toBe('lose')
    expect(inferBodyDirection('feel better this summer', null)).toBeNull()
  })

  it('word-bound: fat never fires inside fatigue, cut never inside execute', () => {
    expect(inferBodyDirection('beat the afternoon fatigue', null)).toBeNull()
    expect(inferBodyDirection('execute the plan', null)).toBeNull()
  })

  it('inflections still count: leaning / cuts / shreds / loss read as lose', () => {
    // The old substring inferrers matched these; word bounds must not drop them.
    expect(inferBodyDirection('leaning out for summer', null)).toBe('lose')
    expect(inferBodyDirection('weight cuts', null)).toBe('lose')
    expect(inferBodyDirection('shreds by June', null)).toBe('lose')
    expect(inferBodyDirection('weight loss journey', null)).toBe('lose')
    expect(inferBodyDirection('bulks up this winter', null)).toBe('gain')
    expect(inferBodyDirection('building my back', null)).toBe('gain')
  })
})

/* ---- agreement: the badge (ticker) and the sentence (guide) on one goal ---- */

// ~8 weeks of weigh-ins going UP about 0.25 kg/week: on-track for a gain,
// drifting for a cut. The exact series both engines read.
function risingWeighIns(): { date: string; kg: number }[] {
  const out: { date: string; kg: number }[] = []
  for (let i = 0; i < 8; i++) {
    const d = new Date(2026, 4, 1 + i * 7)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ date: key, kg: 70 + i * 0.25 })
  }
  return out
}

function tickerState(title: string, profile: 'lose' | 'gain' | 'maintain' | null): string {
  const input: TickerInput = {
    goals: [{ id: 'g1', title, cleanTitle: null, category: 'fitness' }],
    weighIns: risingWeighIns(),
    goalDirection: profile,
    workoutDatesLast21: [],
    lifts: [],
  }
  return buildTicker(input)[0].state
}

function guideWhy(title: string, profile: 'lose' | 'gain' | 'maintain' | null): string {
  const items = buildGoalGuide(
    { title, cleanTitle: null, category: 'fitness' },
    ['weight'],
    { weighIns: risingWeighIns(), weightDirection: profile, units: 'metric' },
  )
  const weight = items.find(i => i.module === 'weight')
  return weight?.why ?? ''
}

describe('badge and sentence agree on the same goal (shared inferrer, both engines)', () => {
  it('"lean bulk" on a lose-profile, scale rising: badge on-track AND sentence praises the gain', () => {
    // Pre-merge this was the contradiction: ticker (fallback-first) judged a cut
    // going up -> drifting; guide (words-first) praised "a lean gaining pace".
    expect(tickerState('lean bulk', 'lose')).toBe('on-track')
    expect(guideWhy('lean bulk', 'lose')).toContain('lean gaining pace')
  })

  it('"cut to 80kg" on a gain-profile, scale rising: badge drifting AND sentence flags the wrong way', () => {
    expect(tickerState('cut to 80kg', 'gain')).toBe('drifting')
    expect(guideWhy('cut to 80kg', 'gain')).toContain('the opposite way for a cut')
  })

  it('wordless title, profile lose, scale rising: both read it as a cut going the wrong way', () => {
    expect(tickerState('watch my weight', 'lose')).toBe('drifting')
    expect(guideWhy('watch my weight', 'lose')).toContain('the opposite way for a cut')
  })

  it('wordless title, profile gain, scale rising: both read it as a gain on pace', () => {
    expect(tickerState('watch my weight', 'gain')).toBe('on-track')
    expect(guideWhy('watch my weight', 'gain')).toContain('lean gaining pace')
  })
})

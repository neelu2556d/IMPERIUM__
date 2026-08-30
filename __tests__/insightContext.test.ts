import { buildInsightContext, INSIGHT_METRICS } from '@/lib/vitals/insightContext'
import type { VitalsReading } from '@/lib/vitals/advice'

const reading: VitalsReading = {
  date: '2026-06-09', recovery: 59, hrv: 42, rhr: 58,
  sleep_perf: 71, sleep_hours: 5.0, strain: 14.2,
}

describe('buildInsightContext', () => {
  it('includes every real metric value and never invents a missing one', () => {
    const ctx = buildInsightContext({
      reading, week: [reading], goal: null, facts: [], workoutsYesterday: [], today: '2026-06-09',
    })
    expect(ctx).toContain('recovery=59')
    expect(ctx).toContain('hrv=42')
    expect(ctx).not.toContain('null')
  })
  it('lists yesterday workouts so it can reason about training load', () => {
    const ctx = buildInsightContext({
      reading, week: [reading], goal: null, facts: [],
      workoutsYesterday: [{ date: '2026-06-08', day_name: 'Legs' }], today: '2026-06-09',
    })
    expect(ctx).toContain('Legs')
  })
  it('includes salient facts verbatim', () => {
    const ctx = buildInsightContext({
      reading, week: [reading], goal: null,
      facts: [{ id: 'f', source: 'mental_health', kind: 'context', body: 'rough sleep in dorm', salience: 0.8, createdAt: '', lastReferencedAt: null, expiresAt: null }],
      workoutsYesterday: [], today: '2026-06-09',
    })
    expect(ctx).toContain('rough sleep in dorm')
  })
  it('exposes the four metric keys we ask the model to write lines for', () => {
    expect(INSIGHT_METRICS).toEqual(['recovery', 'hrv', 'sleep', 'strain'])
  })
})

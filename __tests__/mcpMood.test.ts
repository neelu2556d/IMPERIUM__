import { shapeMoodDaily } from '@/mcp/src/queries'

// Mood-as-a-number (BUILD52): explicit 1–5 check-ins + journal sentiment → one mood
// number per day, the signal the cross-module correlate() engine crosses against
// everything. Timezone-naive datetimes so local-day bucketing is deterministic.

describe('shapeMoodDaily', () => {
  const moodRows = [
    { body: 'Mood today: 4/5 (good)', created_at: '2026-06-10T08:00:00' },
    { body: 'Mood today: 2/5 (low)', created_at: '2026-06-10T20:00:00' }, // later same day → wins
    { body: 'Mood today: 5/5 (great)', created_at: '2026-06-09T10:00:00' },
  ]
  const noteRows = [
    { body: 'so happy today', created_at: '2026-06-10T11:00:00' }, // ignored — 06-10 has a check-in
    { body: 'felt exhausted and anxious all day', created_at: '2026-06-08T12:00:00' },
    { body: 'great productive day, feeling grateful', created_at: '2026-06-07T12:00:00' },
    { body: 'bought groceries and cleaned the kitchen', created_at: '2026-06-06T12:00:00' }, // neutral → dropped
  ]
  const out = shapeMoodDaily(moodRows, noteRows)

  test('latest explicit check-in wins for the day', () => {
    expect(out[0]).toEqual({ date: '2026-06-10', mood: 2, source: 'checkin' })
  })
  test('explicit check-ins are sourced as checkin', () => {
    expect(out.find((d) => d.date === '2026-06-09')).toEqual({ date: '2026-06-09', mood: 5, source: 'checkin' })
  })
  test('a low journal day falls back to negative sentiment', () => {
    const d = out.find((x) => x.date === '2026-06-08')!
    expect(d.source).toBe('notes')
    expect(d.mood).toBeLessThan(3)
  })
  test('a positive journal day reads high', () => {
    const d = out.find((x) => x.date === '2026-06-07')!
    expect(d.source).toBe('notes')
    expect(d.mood).toBeGreaterThan(3)
  })
  test('a neutral-only journal day contributes nothing', () => {
    expect(out.find((x) => x.date === '2026-06-06')).toBeUndefined()
  })
  test('explicit check-in beats a same-day note', () => {
    // 06-10 has both a check-in and a "so happy" note; check-in (mood 2) wins.
    expect(out.filter((x) => x.date === '2026-06-10')).toHaveLength(1)
    expect(out[0].source).toBe('checkin')
  })
  test('newest day first', () => {
    const dates = out.map((d) => d.date)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(out).toHaveLength(4)
  })
  test('empty in → empty out', () => {
    expect(shapeMoodDaily([], [])).toEqual([])
  })
})

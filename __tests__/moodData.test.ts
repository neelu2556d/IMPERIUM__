import { formatMoodBody, parseMoodScore, buildMoodStrip, MOOD_LEVELS } from '@/app/app/mentor/moodData'

test('mood body round-trips through parse for every level', () => {
  for (const lvl of MOOD_LEVELS) {
    const body = formatMoodBody(lvl.score)
    expect(body).toContain(`${lvl.score}/5`)
    expect(body).toContain(lvl.label)
    expect(parseMoodScore(body)).toBe(lvl.score)
  }
})

test('parseMoodScore returns null for non-mood text', () => {
  expect(parseMoodScore('Right now I am dealing with exams.')).toBeNull()
  expect(parseMoodScore('')).toBeNull()
})

test('buildMoodStrip returns N slots oldest-first ending today, latest per day', () => {
  const today = '2026-06-18'
  // newest-first, two entries on today -> the first (latest) wins
  const facts = [
    { body: formatMoodBody(4), createdAt: '2026-06-18T20:00:00' },
    { body: formatMoodBody(2), createdAt: '2026-06-18T09:00:00' },
    { body: formatMoodBody(3), createdAt: '2026-06-16T10:00:00' },
  ]
  const strip = buildMoodStrip(facts, today, 7)
  expect(strip.length).toBe(7)
  expect(strip[strip.length - 1].dayKey).toBe('2026-06-18')
  expect(strip[strip.length - 1].score).toBe(4) // latest today wins
  expect(strip[strip.length - 3].score).toBe(3) // 2 days ago
  expect(strip[0].score).toBeNull() // no data 6 days ago
})

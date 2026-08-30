import { parseSnapshot, coerceNumber } from '@/lib/social/parse'

// The paste-back parser is the load-bearing pure logic of the Social Command
// Center (BUILD51): whatever the Claude Chrome extension returns lands here.

describe('coerceNumber', () => {
  test('plain, commas, K/M/B, and n/a', () => {
    expect(coerceNumber('1234')).toBe(1234)
    expect(coerceNumber('12,300')).toBe(12300)
    expect(coerceNumber('12.3K')).toBe(12300)
    expect(coerceNumber('1.2M')).toBe(1_200_000)
    expect(coerceNumber('2B')).toBe(2_000_000_000)
    expect(coerceNumber('n/a')).toBeNull()
    expect(coerceNumber('—')).toBeNull()
  })
})

describe('parseSnapshot', () => {
  const sample = `PLATFORM: instagram
PERIOD: last 28 days
FOLLOWERS: 12,300
VIEWS: 45.2K
REACH: 30000
NON_FOLLOWER_PCT: 62
LIKES: 2,400
COMMENTS: 180
SAVES: 320
SHARES: 95
FOLLOWS: 210
ENGAGEMENT_RATE: 4.8
TOP_COMMENTS:
- "love this!"
- where did you get that?
- "more please"`

  const s = parseSnapshot(sample, 'tiktok')

  test('platform from the block overrides the hint', () => {
    expect(s.platform).toBe('instagram')
  })
  test('maps + coerces all known metrics', () => {
    expect(s.followers).toBe(12300)
    expect(s.views).toBe(45200)
    expect(s.reach).toBe(30000)
    expect(s.pctNonFollowers).toBe(62)
    expect(s.likes).toBe(2400)
    expect(s.saves).toBe(320)
    expect(s.shares).toBe(95)
    expect(s.engagementRate).toBe(4.8)
  })
  test('collects top comments, stripping bullets and quotes', () => {
    expect(s.topComments).toEqual(['love this!', 'where did you get that?', 'more please'])
  })
  test('rejects nothing-but-prose into no numbers', () => {
    const empty = parseSnapshot('I could not read the page, sorry.', 'youtube')
    expect(empty.followers).toBeUndefined()
    expect(empty.topComments).toEqual([])
    expect(empty.platform).toBe('youtube')
  })
  test('unknown numeric keys land in extra', () => {
    const r = parseSnapshot('PROFILE_VISITS: 1500', 'instagram')
    expect(r.extra.profile_visits).toBe(1500)
  })
})

// Route-handler-level tests for POST /api/studio/lookup: the real handler with
// @/lib/supabase/server and global fetch mocked. Covers the auth gate, URL
// validation, the Data API -> oEmbed ladder, caption best-effort, and that a
// missing YOUTUBE_API_KEY still resolves via oEmbed (the zero-setup promise).

let mockUser: { id: string } | null = { id: 'user-1' }

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockUser ? { tier: 'free' } : null, error: null }),
        }),
      }),
    }),
  }),
}))

import { POST } from '@/app/api/studio/lookup/route'
import { parseVideoId, formatDuration, decodeEntities } from '@/lib/studio/lookup'

const ORIGINAL_ENV = process.env

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/studio/lookup', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  process.env = { ...ORIGINAL_ENV }
  delete process.env.YOUTUBE_API_KEY
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('lib/studio/lookup helpers', () => {
  test('parseVideoId handles the common URL shapes', () => {
    const id = 'dQw4w9WgXcQ'
    expect(parseVideoId(`https://www.youtube.com/watch?v=${id}`)).toBe(id)
    expect(parseVideoId(`https://youtube.com/watch?feature=share&v=${id}`)).toBe(id)
    expect(parseVideoId(`https://youtu.be/${id}`)).toBe(id)
    expect(parseVideoId(`https://youtube.com/shorts/${id}`)).toBe(id)
    expect(parseVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id)
    expect(parseVideoId(`https://www.youtube.com/live/${id}`)).toBe(id)
  })

  test('parseVideoId rejects junk, lookalikes, and oversized input', () => {
    expect(parseVideoId('')).toBeNull()
    expect(parseVideoId('not a url')).toBeNull()
    expect(parseVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseVideoId('https://nottube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseVideoId('https://youtube.com/watch?v=' + 'a'.repeat(600))).toBeNull()
  })

  test('formatDuration converts ISO8601', () => {
    expect(formatDuration('PT12M41S')).toBe('12:41')
    expect(formatDuration('PT1H2M3S')).toBe('1:02:03')
    expect(formatDuration('PT45S')).toBe('0:45')
    expect(formatDuration('nonsense')).toBeNull()
  })

  test('decodeEntities handles the common entities', () => {
    expect(decodeEntities('a &amp; b &#39;quoted&#39; &lt;tag&gt;')).toBe("a & b 'quoted' <tag>")
  })
})

describe('POST /api/studio/lookup', () => {
  test('401 when there is no session', async () => {
    mockUser = null
    const res = await POST(jsonRequest({ url: 'https://youtu.be/dQw4w9WgXcQ' }) as never)
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('400 on a non-YouTube url, with no upstream fetch', async () => {
    const res = await POST(jsonRequest({ url: 'https://example.com/video' }) as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_url')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('with no API key it resolves via oEmbed (zero-setup path), captions best-effort', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('oembed')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ title: 'Real Title', author_name: 'example' }) })
      }
      return Promise.resolve({ ok: false, status: 404 }) // timedtext misses
    })
    const res = await POST(jsonRequest({ url: 'https://youtu.be/dQw4w9WgXcQ' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.video.title).toBe('Real Title')
    expect(body.video.author).toBe('example')
    expect(body.video.source).toBe('oembed')
    expect(body.video.captions).toBeNull()
    // never called the Data API without a key
    const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('googleapis.com/youtube/v3'))).toBe(false)
  })

  test('with an API key it uses the Data API and parses duration, views, description', async () => {
    process.env.YOUTUBE_API_KEY = 'k'
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('googleapis.com/youtube/v3/videos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            items: [{
              snippet: { title: 'API Title', channelTitle: 'example', description: 'the desc', publishedAt: '2026-06-01T00:00:00Z' },
              contentDetails: { duration: 'PT12M41S' },
              statistics: { viewCount: '11300' },
            }],
          }),
        })
      }
      if (url.includes('timedtext?type=list')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<transcript_list><track lang_code="en" name="" kind=""/></transcript_list>') })
      }
      if (url.includes('timedtext?')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<transcript><text start="0">Hello &amp; welcome</text><text start="2">to the video</text></transcript>') })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
    const res = await POST(jsonRequest({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.video.source).toBe('api')
    expect(body.video.title).toBe('API Title')
    expect(body.video.duration).toBe('12:41')
    expect(body.video.stats.views).toBe(11300)
    expect(body.video.description).toBe('the desc')
    expect(body.video.captions).toBe('Hello & welcome to the video')
  })

  test('404 video_not_found when every rung misses', async () => {
    const res = await POST(jsonRequest({ url: 'https://youtu.be/dQw4w9WgXcQ' }) as never)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('video_not_found')
  })

  test('a Data API failure still falls through to oEmbed', async () => {
    process.env.YOUTUBE_API_KEY = 'k'
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) return Promise.reject(new Error('quota'))
      if (url.includes('oembed')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ title: 'Fallback Title', author_name: 'R' }) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
    const res = await POST(jsonRequest({ url: 'https://youtu.be/dQw4w9WgXcQ' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.video.title).toBe('Fallback Title')
    expect(body.video.source).toBe('oembed')
  })
})

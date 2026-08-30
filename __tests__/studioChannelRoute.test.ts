// Route-handler-level tests for POST /api/studio/channel: the keyless channel
// scan that powers the tile's voice-match + don't-repeat features. Covers the
// auth gate, input normalization, handle -> channelId resolution via the
// public channel page, and RSS feed parsing (titles, views, dates).

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

import { POST } from '@/app/api/studio/channel/route'
import { normalizeChannelInput, extractChannelId, parseChannelFeed } from '@/lib/studio/channel'

const CID = 'UC' + 'a'.repeat(22)

const FEED = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
 <title>example</title>
 <entry>
  <yt:videoId>aaaaaaaaaaa</yt:videoId>
  <title>The only split you need &amp; why</title>
  <published>2026-06-27T00:00:00+00:00</published>
  <media:group><media:community><media:statistics views="11300"/></media:community></media:group>
 </entry>
 <entry>
  <yt:videoId>bbbbbbbbbbb</yt:videoId>
  <title>Deload week, done right</title>
  <published>2026-07-01T00:00:00+00:00</published>
  <media:group><media:community><media:statistics views="6800"/></media:community></media:group>
 </entry>
</feed>`

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/studio/channel', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
})

describe('lib/studio/channel helpers', () => {
  test('normalizeChannelInput handles ids, handles, urls, and junk', () => {
    expect(normalizeChannelInput(CID)).toEqual({ id: CID })
    expect(normalizeChannelInput(`https://youtube.com/channel/${CID}`)).toEqual({ id: CID })
    expect(normalizeChannelInput('@example')).toEqual({ handle: 'example' })
    expect(normalizeChannelInput('https://www.youtube.com/@example')).toEqual({ handle: 'example' })
    expect(normalizeChannelInput('example')).toEqual({ handle: 'example' })
    expect(normalizeChannelInput('')).toBeNull()
    expect(normalizeChannelInput('two words here')).toBeNull()
    expect(normalizeChannelInput('x'.repeat(300))).toBeNull()
  })

  test('extractChannelId finds the UC id in channel page html', () => {
    expect(extractChannelId(`junk "channelId":"${CID}" junk`)).toBe(CID)
    expect(extractChannelId('no id here')).toBeNull()
  })

  test('parseChannelFeed pulls titles, views, dates and decodes entities', () => {
    const feed = parseChannelFeed(FEED)
    expect(feed.title).toBe('example')
    expect(feed.videos).toHaveLength(2)
    expect(feed.videos[0]).toEqual({
      videoId: 'aaaaaaaaaaa',
      title: 'The only split you need & why',
      published: '2026-06-27T00:00:00+00:00',
      views: 11300,
    })
  })

  test('parseChannelFeed survives a malformed feed without throwing', () => {
    expect(parseChannelFeed('<feed><entry>broken')).toEqual({ title: null, videos: [] })
  })
})

describe('POST /api/studio/channel', () => {
  test('401 when there is no session', async () => {
    mockUser = null
    const res = await POST(jsonRequest({ channel: '@example' }) as never)
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('400 on junk input, with no upstream fetch', async () => {
    const res = await POST(jsonRequest({ channel: 'not a channel at all' }) as never)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_channel')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('a raw UC id goes straight to the feed (one fetch, no page scrape)', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('feeds/videos.xml')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(FEED) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
    const res = await POST(jsonRequest({ channel: CID }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channel.id).toBe(CID)
    expect(body.channel.title).toBe('example')
    expect(body.channel.videos).toHaveLength(2)
    const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('youtube.com/@'))).toBe(false)
  })

  test('a handle resolves via the channel page, then reads the feed', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('youtube.com/@')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(`<html>"channelId":"${CID}"</html>`) })
      }
      if (url.includes('feeds/videos.xml')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(FEED) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
    const res = await POST(jsonRequest({ channel: '@example' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channel.handle).toBe('@example')
    expect(body.channel.videos[1].title).toBe('Deload week, done right')
  })

  test('404 channel_not_found when the handle does not resolve', async () => {
    const res = await POST(jsonRequest({ channel: '@nosuchchannel' }) as never)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('channel_not_found')
  })
})

// Route-handler-level tests for POST /api/studio/package, on the real
// security surface: mocks @/lib/supabase/server (which requireUser() and the
// route both build on) and global fetch (the Anthropic call), then exercises
// the actual exported POST handler. Assertions are on real behavior (status
// codes, the rpc call, the fetch call), not a canned mock response, so a
// regression that drops the auth gate or the cap check fails these tests
// even though the mocks still "work".

type RpcCall = { fn: string; args: unknown }

let mockUser: { id: string } | null = null
let mockRpcResponse: { data: unknown; error: { message: string } | null } = { data: 1, error: null }
let rpcCalls: RpcCall[] = []

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
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(mockRpcResponse)
    },
  }),
}))

// Imported after the mock so the handler picks up the mocked module.
import { POST } from '@/app/api/studio/package/route'

const ORIGINAL_ENV = process.env

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/studio/package', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const fullPackage = {
  titles: ['One', 'Two', 'Three', 'Four'],
  description: 'A description with a Chapters section.',
  tags: ['tag1', 'tag2'],
  hashtags: ['#one', '#two'],
  chapters: [{ t: '0:00', label: 'Intro' }, { t: '1:20', label: 'Main point' }],
  thumbnailWords: 'BIG WIN',
  thumbnailPrompt: 'A dramatic thumbnail scene.',
}

function mockAnthropicOk(pkg: unknown = fullPackage) {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(pkg) }] })),
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: 'sk-ant-test-key-do-not-leak' }
  mockUser = { id: 'user-abc' }
  mockRpcResponse = { data: 1, error: null }
  rpcCalls = []
  global.fetch = jest.fn()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('POST /api/studio/package: auth gate', () => {
  test('401 when signed out, and never calls the cap rpc or fetch', async () => {
    mockUser = null
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(rpcCalls).toHaveLength(0)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/studio/package: input validation', () => {
  test('400 invalid_input on missing input field', async () => {
    const res = await POST(jsonRequest({}) as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
  })

  test('400 invalid_input on empty/whitespace-only input', async () => {
    const res = await POST(jsonRequest({ input: '   ' }) as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
  })

  test('400 input_too_large when input exceeds MAX_INPUT_CHARS (24000)', async () => {
    const res = await POST(jsonRequest({ input: 'x'.repeat(24001) }) as any)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('input_too_large')
    expect(data.limit).toBe(24000)
  })

  test('validation runs before the cap rpc is ever called', async () => {
    await POST(jsonRequest({ input: '' }) as any)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('POST /api/studio/package: daily cap', () => {
  test('429 daily_limit_reached when bump_ai_usage returns a count over the cap', async () => {
    mockRpcResponse = { data: 26, error: null }
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(429)
    const data = await res.json()
    expect(data.error).toBe('daily_limit_reached')
    expect(data.limit).toBe(25)
    // must not have spent an Anthropic call once capped
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('200 at exactly the cap (25 is allowed, only over-cap is rejected)', async () => {
    mockRpcResponse = { data: 25, error: null }
    mockAnthropicOk()
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(200)
  })

  test('the cap rpc is called with the UTC day key, before the model call', async () => {
    mockAnthropicOk()
    await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('bump_ai_usage')
    // Deliberate global UTC-day cap bucket, not a user-facing local date.
    const utcDay = new Date().toISOString().slice(0, 10)
    expect(rpcCalls[0].args).toEqual({ p_day: utcDay })
  })

  test('500 usage_check_failed when the rpc itself errors (fail-closed, no spend)', async () => {
    mockRpcResponse = { data: null, error: { message: 'db unavailable' } }
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'usage_check_failed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/studio/package: server config', () => {
  test('500 when ANTHROPIC_API_KEY is unset, before any db or network call', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(500)
    expect(rpcCalls).toHaveLength(0)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/studio/package: upstream Anthropic failures', () => {
  test('502 when Anthropic responds non-ok, with a generic body that never echoes the upstream message', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 529,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'overloaded' } })),
    })
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data).toEqual({ error: 'upstream_error' })
    expect(JSON.stringify(data)).not.toContain('overloaded')
  })

  test('502 when Anthropic responds with a non-JSON body, without leaking that body to the client', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>not json</html>'),
    })
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data).toEqual({ error: 'upstream_error' })
    expect(JSON.stringify(data)).not.toContain('<html>')
  })

  test('502 when the model text cannot be parsed as the package JSON', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ content: [{ type: 'text', text: 'not a json package' }] })),
    })
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    expect(res.status).toBe(502)
  })
})

describe('POST /api/studio/package: happy path', () => {
  test('well-formed model JSON shapes into the exact success response', async () => {
    mockAnthropicOk()
    const res = await POST(jsonRequest({ input: 'a transcript', kind: 'notes' }) as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({
      titles: ['One', 'Two', 'Three'], // capped to 3
      description: fullPackage.description,
      tags: fullPackage.tags,
      hashtags: fullPackage.hashtags,
      chapters: fullPackage.chapters,
      thumbnailWords: fullPackage.thumbnailWords,
      thumbnailPrompt: fullPackage.thumbnailPrompt,
    })
  })

  test('sends the required Anthropic auth headers and never leaks the key in the response', async () => {
    mockAnthropicOk()
    const res = await POST(jsonRequest({ input: 'a transcript' }) as any)
    const responseText = JSON.stringify(await res.json())
    expect(responseText).not.toContain('sk-ant-test-key-do-not-leak')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.headers['x-api-key']).toBe('sk-ant-test-key-do-not-leak')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
  })

  test('kind defaults to transcript when absent or garbage, and is passed through otherwise', async () => {
    mockAnthropicOk()
    await POST(jsonRequest({ input: 'material A' }) as any)
    let [, init] = (global.fetch as jest.Mock).mock.calls[0]
    let sentBody = JSON.parse(init.body)
    expect(sentBody.messages[0].content).toContain('Material kind: transcript')

    ;(global.fetch as jest.Mock).mockClear()
    mockAnthropicOk()
    await POST(jsonRequest({ input: 'material B', kind: 'not-a-real-kind' }) as any)
    ;[, init] = (global.fetch as jest.Mock).mock.calls[0]
    sentBody = JSON.parse(init.body)
    expect(sentBody.messages[0].content).toContain('Material kind: transcript')

    ;(global.fetch as jest.Mock).mockClear()
    mockAnthropicOk()
    await POST(jsonRequest({ input: 'material C', kind: 'idea' }) as any)
    ;[, init] = (global.fetch as jest.Mock).mock.calls[0]
    sentBody = JSON.parse(init.body)
    expect(sentBody.messages[0].content).toContain('Material kind: idea')
  })
})

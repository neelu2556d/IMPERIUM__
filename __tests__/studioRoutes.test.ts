import {
  rowToVideo,
  rowToLink,
  validateCreateVideo,
  validateUpdateVideo,
  validateCreateLink,
  validateUpdateLink,
} from '@/app/api/studio/mappers'

describe('studio route mappers', () => {
  test('rowToVideo shapes a db row into the API type', () => {
    const v = rowToVideo({
      id: 'v1',
      title: 'EP3',
      url: '',
      status: 'draft',
      published_at: null,
      notes: null,
      extra: { tags: ['a'] },
      created_at: '2026-07-03T00:00:00Z',
      updated_at: '2026-07-03T00:00:00Z',
    })
    expect(v).toEqual({
      id: 'v1',
      title: 'EP3',
      url: '',
      status: 'draft',
      publishedAt: null,
      notes: null,
      extra: { tags: ['a'] },
      createdAt: '2026-07-03T00:00:00Z',
      updatedAt: '2026-07-03T00:00:00Z',
    })
  })

  test('rowToLink shapes a db row into the API type', () => {
    const l = rowToLink({
      id: 'l1',
      video_id: null,
      label: 'X',
      url: 'x.com/ohwisey',
      kind: 'social',
      is_default: true,
      position: 2,
    })
    expect(l).toEqual({
      id: 'l1',
      videoId: null,
      label: 'X',
      url: 'x.com/ohwisey',
      kind: 'social',
      isDefault: true,
      position: 2,
    })
  })

  test('validateCreateVideo requires a non-empty title', () => {
    expect(validateCreateVideo({ title: '' })).toEqual({ ok: false, error: 'missing_fields' })
    expect(validateCreateVideo(null)).toEqual({ ok: false, error: 'missing_fields' })
    expect(validateCreateVideo({ title: 'EP3' })).toEqual({
      ok: true,
      value: { title: 'EP3', url: '' },
    })
  })

  test('validateUpdateVideo rejects an unknown status', () => {
    expect(validateUpdateVideo({ status: 'live' })).toEqual({ ok: false, error: 'bad_status' })
    expect(validateUpdateVideo({ status: 'published' })).toEqual({
      ok: true,
      value: { status: 'published' },
    })
  })

  test('validateUpdateVideo passes through allowed fields only', () => {
    const r = validateUpdateVideo({ title: 'x', evil: 1, extra: { tags: ['t'] } })
    expect(r).toEqual({ ok: true, value: { title: 'x', extra: { tags: ['t'] } } })
  })

  test('validateCreateLink requires label + url and rejects a bad kind', () => {
    expect(validateCreateLink({ label: '', url: 'a' })).toEqual({ ok: false, error: 'missing_fields' })
    expect(validateCreateLink({ label: 'X', url: 'x.com', kind: 'nope' })).toEqual({
      ok: false,
      error: 'bad_kind',
    })
    expect(validateCreateLink({ label: 'X', url: 'x.com' })).toEqual({
      ok: true,
      value: { label: 'X', url: 'x.com', kind: 'other', videoId: null, isDefault: false, position: 0 },
    })
  })

  test('validateUpdateLink passes a valid partial update through', () => {
    expect(validateUpdateLink({ label: ' New label ', position: 3 })).toEqual({
      ok: true,
      value: { label: 'New label', position: 3 },
    })
  })

  test('validateUpdateLink rejects an unknown kind', () => {
    expect(validateUpdateLink({ kind: 'nope' })).toEqual({ ok: false, error: 'bad_kind' })
  })

  test('validateUpdateLink strips unknown keys', () => {
    const r = validateUpdateLink({ label: 'x', evil: 1, isDefault: true })
    expect(r).toEqual({ ok: true, value: { label: 'x', isDefault: true } })
  })
})

// == Route-handler-level tests, on the actual security surface ==
// These exercise the real exported GET/POST/PATCH/DELETE handlers against a
// mocked `@/lib/supabase/server` createClient, so a regression that drops the
// getUser() gate or a `.eq('user_id', ...)` scope on a query chain is caught
// here, not just in the pure mapper unit tests above. The query builder mock
// is a spy-able chain (every filter method returns `this` and records its
// calls) so we can assert the *actual* filters a handler applied, not just
// the mock's canned response. A handler that silently deletes a user_id
// scope will fail the `calls` assertions below even though the return value
// looks the same.

type Row = Record<string, unknown>

/** One recorded call: the method name + the args it was invoked with. */
type Call = { method: string; args: unknown[] }

/**
 * A thenable, chainable query-builder stub for a single `supabase.from(table)`
 * call. Every chain method (select/insert/update/delete/eq/order/maybeSingle/
 * single) is recorded into `calls` AND returns `this` so real call chains work
 * (e.g. `.update(patch).eq('user_id', id).eq('id', linkId).select(...).single()`).
 * Awaiting/`.then`-ing the chain resolves to the table's configured response.
 */
function makeQueryBuilder(response: { data: unknown; error: unknown }, calls: Call[]) {
  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args })
    return builder
  }
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => record('select', args),
    insert: (...args: unknown[]) => record('insert', args),
    update: (...args: unknown[]) => record('update', args),
    delete: (...args: unknown[]) => record('delete', args),
    eq: (...args: unknown[]) => record('eq', args),
    order: (...args: unknown[]) => record('order', args),
    maybeSingle: () => {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve(response)
    },
    single: () => {
      calls.push({ method: 'single', args: [] })
      return Promise.resolve(response)
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  }
  return builder
}

/**
 * Per-table scripted responses + a flat call log, keyed by table name. Tests
 * configure `tableResponses.studio_links = { data: ..., error: null }` etc,
 * then inspect `callLog` (or `callsFor(table)`) to assert the handler applied
 * the right filters.
 */
let tableResponses: Record<string, { data: unknown; error: unknown }> = {}
let callLog: Array<{ table: string; calls: Call[] }> = []
let mockUser: { id: string } | null = null

function callsFor(table: string): Call[] {
  const entry = callLog.find((e) => e.table === table)
  return entry ? entry.calls : []
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
    },
    from: (table: string) => {
      const calls: Call[] = []
      callLog.push({ table, calls })
      const response = tableResponses[table] ?? { data: null, error: null }
      return makeQueryBuilder(response, calls)
    },
  }),
}))

// Imported after the mock so the handlers pick up the mocked module.
import { GET as videosGET, POST as videosPOST } from '@/app/api/studio/videos/route'
import { PATCH as videoPATCH, DELETE as videoDELETE } from '@/app/api/studio/videos/[id]/route'
import { GET as linksGET, POST as linksPOST } from '@/app/api/studio/links/route'
import { PATCH as linkPATCH, DELETE as linkDELETE } from '@/app/api/studio/links/[id]/route'

const USER_ID = 'user-abc'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/studio/test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const videoRow: Row = {
  id: 'v1',
  title: 'EP3',
  url: '',
  status: 'draft',
  published_at: null,
  notes: null,
  extra: null,
  created_at: '2026-07-03T00:00:00Z',
  updated_at: '2026-07-03T00:00:00Z',
}

const linkRow: Row = {
  id: 'l1',
  video_id: null,
  label: 'X',
  url: 'x.com',
  kind: 'other',
  is_default: false,
  position: 0,
}

beforeEach(() => {
  tableResponses = {}
  callLog = []
  mockUser = { id: USER_ID }
})

describe('studio routes: signed-out is rejected everywhere (401)', () => {
  beforeEach(() => {
    mockUser = null
  })

  test('GET /api/studio/videos', async () => {
    const res = await videosGET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  test('POST /api/studio/videos', async () => {
    const res = await videosPOST(jsonRequest({ title: 'x' }))
    expect(res.status).toBe(401)
  })

  test('PATCH /api/studio/videos/[id]', async () => {
    const res = await videoPATCH(jsonRequest({ title: 'x' }), { params: { id: 'v1' } })
    expect(res.status).toBe(401)
  })

  test('DELETE /api/studio/videos/[id]', async () => {
    const res = await videoDELETE(jsonRequest({}), { params: { id: 'v1' } })
    expect(res.status).toBe(401)
  })

  test('GET /api/studio/links', async () => {
    const res = await linksGET()
    expect(res.status).toBe(401)
  })

  test('POST /api/studio/links', async () => {
    const res = await linksPOST(jsonRequest({ label: 'X', url: 'x.com' }))
    expect(res.status).toBe(401)
  })

  test('PATCH /api/studio/links/[id]', async () => {
    const res = await linkPATCH(jsonRequest({ label: 'x' }), { params: { id: 'l1' } })
    expect(res.status).toBe(401)
  })

  test('DELETE /api/studio/links/[id]', async () => {
    const res = await linkDELETE(jsonRequest({}), { params: { id: 'l1' } })
    expect(res.status).toBe(401)
  })
})

describe('studio routes: write paths are genuinely scoped to the signed-in user', () => {
  // This is the regression guard: if a handler's `.eq('user_id', user.id)`
  // clause is ever deleted, these assertions fail even though the mock still
  // returns a row, because we inspect the RECORDED calls on the query chain,
  // not just the response.
  test('POST /api/studio/videos scopes the insert to the signed-in user', async () => {
    tableResponses.studio_videos = { data: videoRow, error: null }
    const res = await videosPOST(jsonRequest({ title: 'EP3' }))
    expect(res.status).toBe(200)
    const insertCalls = callsFor('studio_videos').filter((c) => c.method === 'insert')
    expect(insertCalls).toHaveLength(1)
    const insertedPayload = insertCalls[0].args[0] as Record<string, unknown>
    expect(insertedPayload.user_id).toBe(USER_ID)
  })

  test('PATCH /api/studio/links/[id] scopes the update to the signed-in user via .eq', async () => {
    tableResponses.studio_links = { data: linkRow, error: null }
    const res = await linkPATCH(jsonRequest({ label: 'Renamed' }), { params: { id: 'l1' } })
    expect(res.status).toBe(200)
    const eqCalls = callsFor('studio_links').filter((c) => c.method === 'eq')
    // Must have scoped by user_id AND by the target row id.
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', 'l1'] })
  })

  test('DELETE /api/studio/videos/[id] scopes the delete to the signed-in user via .eq', async () => {
    tableResponses.studio_videos = { data: null, error: null }
    const res = await videoDELETE(jsonRequest({}), { params: { id: 'v1' } })
    expect(res.status).toBe(200)
    const eqCalls = callsFor('studio_videos').filter((c) => c.method === 'eq')
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', 'v1'] })
  })
})

describe('studio routes: link POST refuses to attach to another user\'s video', () => {
  test('videoId that does not resolve under the caller (owner check miss) -> 404 video_not_found, no insert', async () => {
    // The owner-scoped lookup on studio_videos finds nothing (maybeSingle -> null),
    // which is exactly what happens when videoId belongs to someone else, since
    // the lookup itself is filtered by .eq('user_id', user.id).
    tableResponses.studio_videos = { data: null, error: null }
    const res = await linksPOST(jsonRequest({ label: 'X', url: 'x.com', videoId: 'someone-elses-video' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'video_not_found' })

    // The ownership check itself must have been scoped by user_id.
    const videoCheckCalls = callsFor('studio_videos').filter((c) => c.method === 'eq')
    expect(videoCheckCalls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(videoCheckCalls).toContainEqual({ method: 'eq', args: ['id', 'someone-elses-video'] })

    // And no insert into studio_links should have happened.
    const linkInsertCalls = callsFor('studio_links').filter((c) => c.method === 'insert')
    expect(linkInsertCalls).toHaveLength(0)
  })

  test('videoId that IS owned by the caller -> insert proceeds', async () => {
    tableResponses.studio_videos = { data: { id: 'my-video' }, error: null }
    tableResponses.studio_links = { data: linkRow, error: null }
    const res = await linksPOST(jsonRequest({ label: 'X', url: 'x.com', videoId: 'my-video' }))
    expect(res.status).toBe(200)
    const linkInsertCalls = callsFor('studio_links').filter((c) => c.method === 'insert')
    expect(linkInsertCalls).toHaveLength(1)
  })

  test('null videoId skips the ownership check entirely and inserts', async () => {
    tableResponses.studio_links = { data: linkRow, error: null }
    const res = await linksPOST(jsonRequest({ label: 'X', url: 'x.com' }))
    expect(res.status).toBe(200)
    // No lookup against studio_videos should have happened at all.
    expect(callsFor('studio_videos')).toHaveLength(0)
  })
})

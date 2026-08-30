import { toStreamRow, toReportRow, reportStreamWith, type DbLike } from '@/lib/tiles/reportWrites'

const beer = { key: 'Beer', label: 'Beers', value: 3, date: '2026-06-28', kind: 'intake', goalDirection: 'down' }

describe('row mapping', () => {
  test('toStreamRow normalizes the canonical family and scopes to user + tile', () => {
    const row = toStreamRow('u1', 't1', { ...beer, key: 'beers' } as any)
    expect(row).toEqual({
      user_id: 'u1',
      tile_id: 't1',
      key: 'beers',
      canonical_key: 'alcohol',
      label: 'Beers',
      kind: 'intake',
      goal_direction: 'down',
    })
  })

  test('toStreamRow leaves goal_direction null when absent', () => {
    const { goalDirection, ...noDir } = beer
    const row = toStreamRow('u1', 't1', noDir as any)
    expect(row.goal_direction).toBeNull()
  })

  test('toReportRow ties the datapoint to its stream row, scoped to the user', () => {
    const row = toReportRow('u1', 's1', beer as any)
    expect(row).toEqual({ user_id: 'u1', stream_id: 's1', stream_key: 'Beer', value: 3, date: '2026-06-28' })
  })
})

/**
 * An in-memory stand-in for the two tile tables, faithful to the shapes the
 * write path uses: select().eq()...maybeSingle() and upsert().select().single(),
 * with real (user_id, tile_id, key) conflict semantics so the collision and
 * pinning behaviour is exercised for real, not mocked away.
 */
function fakeDb() {
  const streams: any[] = []
  const reports: any[] = []
  let nextId = 1

  const db: DbLike = {
    from(table: string) {
      return {
        select(_cols: string) {
          const filters: Record<string, unknown> = {}
          const chain = {
            eq(col: string, v: unknown) {
              filters[col] = v
              return chain
            },
            async maybeSingle() {
              const rows = table === 'tile_streams' ? streams : reports
              const hit = rows.find((r) => Object.entries(filters).every(([c, v]) => r[c] === v))
              return { data: hit ?? null, error: null }
            },
          }
          return chain
        },
        upsert(row: any, _opts: any) {
          const write = () => {
            if (table === 'tile_streams') {
              const hit = streams.find(
                (r) => r.user_id === row.user_id && r.tile_id === row.tile_id && r.key === row.key,
              )
              if (hit) {
                Object.assign(hit, row)
                return hit
              }
              const created = { id: `s${nextId++}`, ...row }
              streams.push(created)
              return created
            }
            const hit = reports.find(
              (r) => r.user_id === row.user_id && r.stream_id === row.stream_id && r.date === row.date,
            )
            if (hit) {
              Object.assign(hit, row)
              return hit
            }
            reports.push({ ...row })
            return row
          }
          const done = Promise.resolve().then(write)
          return Object.assign(
            { then: (res: any, rej: any) => done.then(() => ({ error: null })).then(res, rej) },
            {
              select(_c: string) {
                return { async single() { return { data: await done, error: null } } }
              },
            },
          ) as any
        },
      }
    },
  }
  return { db, streams, reports }
}

describe('reportStreamWith: server-side RLS write', () => {
  test('a valid report upserts the stream and ties the datapoint to its row', async () => {
    const { db, streams, reports } = fakeDb()
    const res = await reportStreamWith(db, 'u1', 't1', beer)
    expect(res.ok).toBe(true)
    expect(streams).toHaveLength(1)
    expect(streams[0].canonical_key).toBe('alcohol')
    expect(reports).toHaveLength(1)
    expect(reports[0].stream_id).toBe(streams[0].id)
  })

  test('an invalid report is rejected and writes nothing', async () => {
    const { db, streams, reports } = fakeDb()
    const res = await reportStreamWith(db, 'u1', 't1', { ...beer, kind: 'vibes' })
    expect(res.ok).toBe(false)
    expect(streams).toHaveLength(0)
    expect(reports).toHaveLength(0)
  })

  test('a missing tile id is rejected, never silently merged', async () => {
    const { db, streams } = fakeDb()
    const res = await reportStreamWith(db, 'u1', '', beer)
    expect(res.ok).toBe(false)
    expect(streams).toHaveLength(0)
  })

  test('TWO tiles reporting the same key stay two separate streams (no clobber)', async () => {
    const { db, streams, reports } = fakeDb()
    await reportStreamWith(db, 'u1', 'tileA', beer)
    await reportStreamWith(db, 'u1', 'tileB', {
      ...beer, label: 'Craft brews', kind: 'count', goalDirection: undefined, value: 1,
    })

    expect(streams).toHaveLength(2)
    const a = streams.find((s) => s.tile_id === 'tileA')
    const b = streams.find((s) => s.tile_id === 'tileB')
    // each keeps ITS OWN label + kind; neither was overwritten
    expect(a.label).toBe('Beers')
    expect(a.kind).toBe('intake')
    expect(b.label).toBe('Craft brews')
    expect(b.kind).toBe('count')
    // and the datapoints landed under their own streams, not merged
    expect(reports).toHaveLength(2)
    expect(reports.map((r) => r.stream_id).sort()).toEqual([a.id, b.id].sort())
  })

  test('kind/goalDirection are PINNED to first-seen; a later mismatch cannot flip the mode', async () => {
    const { db, streams, reports } = fakeDb()
    await reportStreamWith(db, 'u1', 't1', beer) // intake / down
    const res = await reportStreamWith(db, 'u1', 't1', {
      ...beer, date: '2026-06-29', kind: 'count', goalDirection: 'up', label: 'Beers v2',
    })

    expect(res.ok).toBe(true) // the datapoint still lands
    expect(streams).toHaveLength(1)
    expect(streams[0].kind).toBe('intake') // pinned
    expect(streams[0].goal_direction).toBe('down') // pinned
    expect(streams[0].label).toBe('Beers v2') // label may refresh
    expect(reports).toHaveLength(2)
  })

  test('same tile, same day upserts the datapoint instead of duplicating', async () => {
    const { db, reports } = fakeDb()
    await reportStreamWith(db, 'u1', 't1', beer)
    await reportStreamWith(db, 'u1', 't1', { ...beer, value: 5 })
    expect(reports).toHaveLength(1)
    expect(reports[0].value).toBe(5)
  })
})

import { saveWorkoutState, saveWorkoutKeepalive } from '@/lib/workouts/queries'

/**
 * Regression guard for the "finished workout silently deleted" data-loss bug.
 *
 * The logger autosaves continuously. Its empty-session cleanup DELETEs the
 * (user, date, day_name) row whenever a save arrives with no genuinely-logged
 * set. After a session is FINISHED (submitted_at set), a trailing autosave /
 * unload write — which carries no submittedAt and may snapshot an empty set
 * list — must NEVER be allowed to delete that finished row. The delete is
 * scoped to `submitted_at IS NULL` so a finished session is immune.
 */

type Row = {
  user_id: string
  date: string
  day_name: string
  exercises: unknown
  submitted_at: string | null
}

/** Minimal in-memory PostgREST stand-in: supports the delete/upsert chains
 *  saveWorkoutState uses, filtering an in-memory table so we test real outcomes
 *  (does the row survive?) rather than which methods were called. */
function makeFakeSupabase(seed: Row[] = []) {
  const table: Row[] = seed.map((r) => ({ ...r }))
  function from(_name: string) {
    let op: 'delete' | 'upsert' | null = null
    let upsertRow: Record<string, unknown> | null = null
    const filters: Array<{ col: string; val: unknown }> = []
    const builder: Record<string, unknown> = {
      delete() { op = 'delete'; return builder },
      upsert(row: Record<string, unknown>) { op = 'upsert'; upsertRow = row; return builder },
      eq(col: string, val: unknown) { filters.push({ col, val }); return builder },
      is(col: string, val: unknown) { filters.push({ col, val }); return builder },
      then(resolve: (v: { error: null }) => void) {
        if (op === 'delete') {
          const match = (r: Row) => filters.every((f) => (r as Record<string, unknown>)[f.col] === f.val)
          for (let i = table.length - 1; i >= 0; i--) if (match(table[i])) table.splice(i, 1)
        } else if (op === 'upsert' && upsertRow) {
          const key = (r: Record<string, unknown>) => `${r.user_id}|${r.date}|${r.day_name}`
          const idx = table.findIndex((r) => key(r as unknown as Record<string, unknown>) === key(upsertRow!))
          if (idx >= 0) table[idx] = { ...table[idx], ...(upsertRow as object) } as Row
          else table.push({ submitted_at: null, ...(upsertRow as object) } as Row)
        }
        resolve({ error: null })
      },
    }
    return builder
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, table }
}

test('an empty trailing save does NOT delete a finished (submitted) session', async () => {
  const finished: Row = {
    user_id: 'u1', date: '2026-06-19', day_name: 'Push',
    exercises: [], submitted_at: '2026-06-19T20:00:00.000Z',
  }
  const { client, table } = makeFakeSupabase([finished])

  // A post-finish autosave / unload write: no logged set, no submittedAt.
  await saveWorkoutState(client, { userId: 'u1', date: '2026-06-19', dayName: 'Push', exercises: [] })

  expect(table).toHaveLength(1)
  expect(table[0].submitted_at).toBe('2026-06-19T20:00:00.000Z')
})

test('an empty save still cleans up an UNFINISHED ghost session', async () => {
  const ghost: Row = {
    user_id: 'u1', date: '2026-06-19', day_name: 'Push',
    exercises: [], submitted_at: null,
  }
  const { client, table } = makeFakeSupabase([ghost])

  await saveWorkoutState(client, { userId: 'u1', date: '2026-06-19', dayName: 'Push', exercises: [] })

  expect(table).toHaveLength(0)
})

test('keepalive empty cleanup scopes its delete to unfinished rows only', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true })
  const original = global.fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fetchMock as any
  try {
    await saveWorkoutKeepalive(
      { url: 'https://proj.supabase.co', anonKey: 'anon', accessToken: 'tok' },
      { userId: 'u1', date: '2026-06-19', dayName: 'Push', exercises: [] },
    )
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(opts.method).toBe('DELETE')
    expect(String(calledUrl)).toContain('submitted_at=is.null')
  } finally {
    global.fetch = original
  }
})

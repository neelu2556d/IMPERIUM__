import { newerTables, WATCHED_TABLES } from '@/lib/sync/remoteWatch'

// The "watch it change" pill fires when a blob table's updated_at moves PAST the
// baseline this tab recorded — i.e. a remote write (Claude via MCP, or another
// device). These pin the detection: strictly-newer only, never the tab's own
// unchanged state, and ISO timestamps compare correctly.

describe('newerTables', () => {
  const T = 'brand_state'

  test('no change → nothing flagged', () => {
    expect(newerTables({ [T]: '2026-06-20T10:00:00+00:00' }, { [T]: '2026-06-20T10:00:00+00:00' })).toEqual([])
  })

  test('a strictly newer timestamp → flagged (Claude wrote)', () => {
    expect(newerTables({ [T]: '2026-06-20T10:00:00+00:00' }, { [T]: '2026-06-20T10:05:00+00:00' })).toEqual([T])
  })

  test('an OLDER/equal timestamp is never flagged (no false positive)', () => {
    expect(newerTables({ [T]: '2026-06-20T10:05:00+00:00' }, { [T]: '2026-06-20T10:00:00+00:00' })).toEqual([])
  })

  test('server has data where baseline had none (first remote write) → flagged', () => {
    expect(newerTables({ [T]: null }, { [T]: '2026-06-20T10:00:00+00:00' })).toEqual([T])
  })

  test('server still empty (null) → not flagged', () => {
    expect(newerTables({ [T]: null }, { [T]: null })).toEqual([])
  })

  test('only the changed tables are returned across many', () => {
    const baseline = { brand_state: '2026-06-20T10:00:00+00:00', goals_state: '2026-06-20T10:00:00+00:00', peak_state: null }
    const current = { brand_state: '2026-06-20T10:00:00+00:00', goals_state: '2026-06-20T11:00:00+00:00', peak_state: '2026-06-20T09:00:00+00:00' }
    expect(newerTables(baseline, current).sort()).toEqual(['goals_state', 'peak_state'].sort())
  })

  test('watches the four blob modules (water excluded — relational)', () => {
    expect(Object.values(WATCHED_TABLES).sort()).toEqual(['brand_state', 'goals_state', 'peak_state', 'supplements_state'].sort())
    expect(Object.keys(WATCHED_TABLES)).not.toContain('vitality_water_v1')
  })
})

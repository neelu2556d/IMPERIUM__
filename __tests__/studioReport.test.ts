import { publishedCountToReport } from '@/lib/studio/report'
import { validateReport } from '@/lib/tiles/reportContract'

describe('studio videos_published report', () => {
  test('counts only published videos', () => {
    const r = publishedCountToReport(
      [{ status: 'published' }, { status: 'draft' }, { status: 'published' }, { status: 'archived' }],
      '2026-07-03',
    )
    expect(r.value).toBe(2)
  })

  test('emits the exact locked stream shape', () => {
    const r = publishedCountToReport([{ status: 'published' }], '2026-07-03')
    expect(r).toEqual({
      key: 'videos_published',
      label: 'Videos shipped',
      value: 1,
      date: '2026-07-03',
      kind: 'count',
      goalDirection: 'up',
    })
  })

  test('the produced stream passes the LOCKED validateReport contract', () => {
    const r = publishedCountToReport([{ status: 'published' }, { status: 'published' }], '2026-07-03')
    const res = validateReport(r)
    expect(res.ok).toBe(true)
  })

  test('zero published is a valid, reportable zero', () => {
    const r = publishedCountToReport([{ status: 'draft' }], '2026-07-03')
    expect(r.value).toBe(0)
    expect(validateReport(r).ok).toBe(true)
  })
})

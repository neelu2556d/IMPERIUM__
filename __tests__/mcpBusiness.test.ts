import { getBusiness } from '@/mcp/src/queries'
import type { VitalityDb } from '@/mcp/src/supabase'

// Read layer for the business-overview MCP tool. getBusiness reads the SAME
// `brand_state` jsonb blob the client mirrors (per-brand Business view is the
// single source) and surfaces each venture's custom KPIs + a 7-day delta from
// their history. These pin the parse, the archived-filter, and the trend math.

const DAY = 86_400_000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()

/** A VitalityDb whose `brand_state` read yields `blob` (or null = no row). */
function vdbWithBrandBlob(blob: unknown): VitalityDb {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = async () => ({ data: blob == null ? null : { data: blob }, error: null })
  return {
    db: { from: () => builder },
    userId: 'u1',
    mode: 'user',
    scopes: ['mcp:read'],
  } as unknown as VitalityDb
}

describe('getBusiness', () => {
  test('no brand_state row → no data', async () => {
    const biz = await getBusiness(vdbWithBrandBlob(null))
    expect(biz).toEqual({ hasData: false, ventures: [] })
  })

  test('brands with no KPIs → hasData false (a venture only counts once it tracks a number)', async () => {
    const biz = await getBusiness(vdbWithBrandBlob({ brands: [{ name: 'Acme', kpis: [] }, { name: 'Empty' }] }))
    expect(biz.hasData).toBe(false)
    expect(biz.ventures).toEqual([])
  })

  test('surfaces label/value/unit, skips KPIs missing a label or value', async () => {
    const biz = await getBusiness(
      vdbWithBrandBlob({
        brands: [
          {
            name: 'Acme Store',
            kpis: [
              { id: 'k1', label: 'Revenue', value: 12000, unit: '$' },
              { id: 'k2', label: 'Rating', value: 4.8, unit: '/5' },
              { id: 'k3', label: '', value: 5 }, // no label → dropped
              { id: 'k4', label: 'No value' }, // no value → dropped
            ],
          },
        ],
      }),
    )
    expect(biz.hasData).toBe(true)
    expect(biz.ventures).toHaveLength(1)
    expect(biz.ventures[0].name).toBe('Acme Store')
    expect(biz.ventures[0].metrics).toEqual([
      { label: 'Revenue', value: 12000, unit: '$', delta7: null },
      { label: 'Rating', value: 4.8, unit: '/5', delta7: null },
    ])
  })

  test('archived brands are excluded; unnamed brand falls back', async () => {
    const biz = await getBusiness(
      vdbWithBrandBlob({
        brands: [
          { name: 'Live', kpis: [{ label: 'Leads', value: 10 }] },
          { name: 'Old', archived: true, kpis: [{ label: 'Leads', value: 99 }] },
          { kpis: [{ label: 'MRR', value: 500 }] },
        ],
      }),
    )
    expect(biz.ventures.map((v) => v.name)).toEqual(['Live', '(unnamed)'])
  })

  test('delta7 trends value over the window; oldest-in-window is the baseline', async () => {
    const biz = await getBusiness(
      vdbWithBrandBlob({
        brands: [
          {
            name: 'Acme',
            kpis: [
              {
                label: 'Revenue',
                value: 12000,
                unit: '$',
                history: [
                  { at: iso(14), value: 10000 }, // before the 7d cutoff → baseline
                  { at: iso(0), value: 12000 }, // current
                ],
              },
            ],
          },
        ],
      }),
    )
    expect(biz.ventures[0].metrics[0].delta7).toBe(2000)
  })

  test('delta7 is null with fewer than two datapoints (e.g. a freshly auto-pulled metric)', async () => {
    const biz = await getBusiness(
      vdbWithBrandBlob({
        brands: [{ name: 'Acme', kpis: [{ label: 'Revenue', value: 12000, history: [{ at: iso(0), value: 12000 }] }] }],
      }),
    )
    expect(biz.ventures[0].metrics[0].delta7).toBeNull()
  })
})

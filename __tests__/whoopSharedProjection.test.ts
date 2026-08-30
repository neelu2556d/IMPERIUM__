import { buildSharedWhoopProjection } from '../lib/whoop/sharedProjection'

describe('WHOOP shared-brain projection', () => {
  it('exports only normalized metrics in chronological order', () => {
    const projection = buildSharedWhoopProjection([
      {
        date: '2026-08-02', provider: 'whoop', recovery: 80, hrv: 110, rhr: 48,
        sleep_perf: 85, sleep_hours: 8.1, strain: 1.2,
      },
      {
        date: '2026-08-01', provider: 'whoop', recovery: 70, hrv: 100, rhr: 50,
        sleep_perf: 75, sleep_hours: 7.2, strain: 12,
      },
    ])

    expect(projection.readings.rows.map((row) => row.date)).toEqual(['2026-08-01', '2026-08-02'])
    expect(projection.connection.rows).toEqual([
      { provider: 'whoop', encrypted_access_token: 'connected' },
    ])
    expect(JSON.stringify(projection)).not.toMatch(/raw|secret|provider_user|client_id|email/i)
  })

  it('drops non-WHOOP rows', () => {
    const projection = buildSharedWhoopProjection([
      {
        date: '2026-08-02', provider: 'oura', recovery: 90, hrv: 120, rhr: 45,
        sleep_perf: 90, sleep_hours: 8.5, strain: null,
      },
    ])
    expect(projection.readings.rows).toEqual([])
  })
})

import {
  addNote,
  logWeight,
  logMeal,
  logWater,
  logWorkout,
  markSupplementTaken,
  logBusinessMetric,
  requireWrite,
} from '@/mcp/src/mutations'
import type { VitalityDb } from '@/mcp/src/supabase'

// Write layer for the Vitality MCP (BUILD42 + BUILD46). Pins the capability gate,
// input validation (which must run BEFORE any DB call), the happy paths, and the
// persisted shapes — against a minimal mock of the Supabase fluent client that is
// both chainable AND awaitable (like PostgrestBuilder) and records its writes.

const WRITE = ['mcp:read', 'mcp:write']
const READ_ONLY = ['mcp:read']
const OK = { data: null, error: null }

interface MockOpts {
  maybeSingle?: unknown
  single?: unknown[]
  await?: unknown[]
}
function mockDb(opts: MockOpts = {}) {
  const calls: { table: string; op: string; payload: unknown }[] = []
  const singleQ = [...(opts.single ?? [])]
  const awaitQ = [...(opts.await ?? [])]
  let table = ''
  const builder: Record<string, unknown> = {}
  for (const op of ['insert', 'upsert', 'update']) {
    builder[op] = (payload: unknown) => {
      calls.push({ table, op, payload })
      return builder
    }
  }
  for (const op of ['select', 'eq']) builder[op] = () => builder
  builder.single = async () => singleQ.shift() ?? OK
  builder.maybeSingle = async () => opts.maybeSingle ?? OK
  // Awaitable: `await db.from(x).insert(y)` resolves here.
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(awaitQ.shift() ?? OK).then(res, rej)
  return {
    db: {
      from: (t: string) => {
        table = t
        return builder
      },
    },
    calls,
  }
}

/** A db that explodes if any query is attempted — proves validation ran first. */
const untouchableDb = {
  from() {
    throw new Error('DB should not be touched')
  },
}

function vdb(scopes: string[], db: unknown): VitalityDb {
  return { db, userId: 'u1', mode: 'user', scopes } as unknown as VitalityDb
}

describe('requireWrite', () => {
  test('passes with mcp:write, throws a fix-it message without it', () => {
    expect(() => requireWrite(vdb(WRITE, {}))).not.toThrow()
    expect(() => requireWrite(vdb(READ_ONLY, {}))).toThrow(/read-only/i)
    expect(() => requireWrite(vdb(READ_ONLY, {}))).toThrow(/grant write|CLI token/i)
  })
})

describe('addNote', () => {
  test('read-only refused before the DB', async () => {
    await expect(addNote(vdb(READ_ONLY, untouchableDb), 'hi')).rejects.toThrow(/read-only/i)
  })
  test('empty + over-long rejected before the DB', async () => {
    await expect(addNote(vdb(WRITE, untouchableDb), '   ')).rejects.toThrow(/empty/i)
    await expect(addNote(vdb(WRITE, untouchableDb), 'x'.repeat(4001))).rejects.toThrow(/too long/i)
  })
  test('happy path trims, returns + audits', async () => {
    const m = mockDb({ single: [{ data: { id: 'n1', body: 'call mum', created_at: '2026-06-18T09:00:00Z' }, error: null }] })
    const out = await addNote(vdb(WRITE, m.db), '  call mum  ')
    expect(out).toEqual({ id: 'n1', body: 'call mum', createdAt: '2026-06-18T09:00:00Z' })
    expect(m.calls.some((c) => c.table === 'mcp_write_log')).toBe(true) // audited
  })
  test('a failed audit never fails the write', async () => {
    // single returns the note; the audit insert (awaited) errors — must be swallowed.
    const m = mockDb({ single: [{ data: { id: 'n1', body: 'hi', created_at: '' }, error: null }], await: [{ error: { message: 'no table' } }] })
    await expect(addNote(vdb(WRITE, m.db), 'hi')).resolves.toMatchObject({ id: 'n1' })
  })
  test('surfaces a DB error cleanly', async () => {
    const m = mockDb({ single: [{ data: null, error: { message: 'boom' } }] })
    await expect(addNote(vdb(WRITE, m.db), 'hi')).rejects.toThrow(/Could not save note: boom/)
  })
})

describe('logWeight', () => {
  test('read-only + range + bad date rejected before the DB', async () => {
    await expect(logWeight(vdb(READ_ONLY, untouchableDb), 80)).rejects.toThrow(/read-only/i)
    await expect(logWeight(vdb(WRITE, untouchableDb), 5)).rejects.toThrow(/between 20 and 400/i)
    await expect(logWeight(vdb(WRITE, untouchableDb), 80, { date: '18-06-2026' })).rejects.toThrow(/YYYY-MM-DD/)
  })
  test('new weigh-in rounds to 2dp, replaced=false', async () => {
    const m = mockDb({ maybeSingle: { data: null }, single: [{ data: { date: '2026-06-18', weight_kg: 80.13, note: null }, error: null }] })
    const out = await logWeight(vdb(WRITE, m.db), 80.126, { date: '2026-06-18' })
    expect(out.replaced).toBe(false)
    expect(out.kg).toBeCloseTo(80.13, 2)
  })
  test('existing day → replaced=true', async () => {
    const m = mockDb({ maybeSingle: { data: { id: 'w1' } }, single: [{ data: { date: '2026-06-18', weight_kg: 79.5, note: 'am' }, error: null }] })
    expect((await logWeight(vdb(WRITE, m.db), 79.5, { date: '2026-06-18', note: 'am' })).replaced).toBe(true)
  })
})

describe('logMeal', () => {
  test('read-only + kcal range rejected before the DB', async () => {
    await expect(logMeal(vdb(READ_ONLY, untouchableDb), { kcal: 500 })).rejects.toThrow(/read-only/i)
    await expect(logMeal(vdb(WRITE, untouchableDb), { kcal: -1 })).rejects.toThrow(/between 0 and 20000/i)
  })
  test('clamps macros, rounds, appends + records totals', async () => {
    const m = mockDb()
    const out = await logMeal(vdb(WRITE, m.db), { kcal: 612.7, protein: 40.4, carbs: -5, fat: 9999, description: '  eggs  ', date: '2026-06-18' })
    expect(out.totals).toEqual({ kcal: 613, protein: 40, carbs: 0, fat: 2000 })
    expect(out.description).toBe('eggs')
    const insert = m.calls.find((c) => c.table === 'nutrition_meals')
    expect((insert!.payload as { day_key: string }).day_key).toBe('2026-06-18')
  })
})

describe('logWater', () => {
  test('read-only refused', async () => {
    await expect(logWater(vdb(READ_ONLY, untouchableDb), {})).rejects.toThrow(/read-only/i)
  })
  test('increments from current count by default', async () => {
    const m = mockDb({ maybeSingle: { data: { count: 3 } } })
    const out = await logWater(vdb(WRITE, m.db), { servings: 2, date: '2026-06-18' })
    expect(out.count).toBe(5)
    expect(out.added).toBe(2)
    const up = m.calls.find((c) => c.table === 'water_days')
    expect((up!.payload as { count: number }).count).toBe(5)
  })
  test('setTo sets an absolute count', async () => {
    const m = mockDb({ maybeSingle: { data: { count: 9 } } })
    expect((await logWater(vdb(WRITE, m.db), { setTo: 4 })).count).toBe(4)
  })
  test('floors at zero', async () => {
    const m = mockDb({ maybeSingle: { data: { count: 1 } } })
    expect((await logWater(vdb(WRITE, m.db), { servings: -5 })).count).toBe(0)
  })
})

describe('logWorkout', () => {
  test('read-only + missing exercises rejected before the DB', async () => {
    await expect(logWorkout(vdb(READ_ONLY, untouchableDb), { dayName: 'Push', exercises: [{ name: 'Bench' }] })).rejects.toThrow(/read-only/i)
    await expect(logWorkout(vdb(WRITE, untouchableDb), { dayName: 'Push', exercises: [] })).rejects.toThrow(/at least one exercise/i)
    await expect(logWorkout(vdb(WRITE, untouchableDb), { dayName: '', exercises: [{ name: 'Bench' }] })).rejects.toThrow(/dayName/i)
  })
  test('builds the persisted set shape, replaced=false for a new day', async () => {
    const m = mockDb({ maybeSingle: { data: null } })
    const out = await logWorkout(vdb(WRITE, m.db), { dayName: 'Push', date: '2026-06-18', exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weightKg: 80 }] })
    expect(out).toMatchObject({ replaced: false, exerciseCount: 1, setCount: 3 })
    const insert = m.calls.find((c) => c.table === 'workouts')!
    const ex = (insert.payload as { exercises: { id: string; name: string; sets: { weight: number; reps: number; done: boolean }[] }[] }).exercises[0]
    expect(ex.id).toBe('bench-press')
    expect(ex.sets).toHaveLength(3)
    expect(ex.sets[0]).toEqual({ weight: 80, reps: 8, done: true, failed: false })
  })
  test('existing day → update + replaced=true', async () => {
    const m = mockDb({ maybeSingle: { data: { id: 'wk1' } } })
    const out = await logWorkout(vdb(WRITE, m.db), { dayName: 'Legs', exercises: [{ name: 'Squat' }] })
    expect(out.replaced).toBe(true)
    expect(m.calls.some((c) => c.table === 'workouts' && c.op === 'update')).toBe(true)
  })
})

describe('markSupplementTaken', () => {
  const stack = { items: [{ id: 'creatine', name: 'Creatine' }, { id: 'd3', name: 'Vitamin D3' }], taken: {} }
  test('read-only + no-stack + no-match rejected', async () => {
    await expect(markSupplementTaken(vdb(READ_ONLY, untouchableDb), { name: 'Creatine' })).rejects.toThrow(/read-only/i)
    const empty = mockDb({ maybeSingle: { data: { data: { items: [] } } } })
    await expect(markSupplementTaken(vdb(WRITE, empty.db), { name: 'Creatine' })).rejects.toThrow(/no supplement stack/i)
    const m = mockDb({ maybeSingle: { data: { data: stack } } })
    await expect(markSupplementTaken(vdb(WRITE, m.db), { name: 'Zinc' })).rejects.toThrow(/No supplement matching/i)
  })
  test('matches by name (case-insensitive), sets a timestamp in taken[day][id]', async () => {
    const m = mockDb({ maybeSingle: { data: { data: stack } } })
    const out = await markSupplementTaken(vdb(WRITE, m.db), { name: 'creatine', date: '2026-06-18' })
    expect(out).toMatchObject({ name: 'Creatine', taken: true, dayKey: '2026-06-18' })
    const up = m.calls.find((c) => c.table === 'supplements_state')!
    const taken = (up.payload as { data: { taken: Record<string, Record<string, number>> } }).data.taken
    expect(typeof taken['2026-06-18'].creatine).toBe('number') // ms timestamp
  })
  test('taken:false removes the entry', async () => {
    const pre = { items: stack.items, taken: { '2026-06-18': { creatine: 123 } } }
    const m = mockDb({ maybeSingle: { data: { data: pre } } })
    await markSupplementTaken(vdb(WRITE, m.db), { id: 'creatine', taken: false, date: '2026-06-18' })
    const up = m.calls.find((c) => c.table === 'supplements_state')!
    const taken = (up.payload as { data: { taken: Record<string, Record<string, number>> } }).data.taken
    expect(taken['2026-06-18'].creatine).toBeUndefined()
  })
})

describe('logBusinessMetric (brand KPI blob write)', () => {
  type Kpi = { id?: string; label: string; value: number; unit?: string; history?: { at: string; value: number }[] }
  type Brand = { name?: string; archived?: boolean; kpis?: Kpi[] }
  // The brands array out of the upserted brand_state payload.
  const writtenBrands = (m: ReturnType<typeof mockDb>): Brand[] => {
    const up = m.calls.find((c) => c.table === 'brand_state')!
    return (up.payload as { data: { brands: Brand[] } }).data.brands
  }

  test('read-only refused before the DB', async () => {
    await expect(
      logBusinessMetric(vdb(READ_ONLY, untouchableDb), { metric: 'Revenue', value: 1000 }),
    ).rejects.toThrow(/read-only/i)
  })

  test('empty label / non-finite value rejected before the DB', async () => {
    await expect(logBusinessMetric(vdb(WRITE, untouchableDb), { metric: '  ', value: 1 })).rejects.toThrow(/label is required/i)
    await expect(logBusinessMetric(vdb(WRITE, untouchableDb), { metric: 'Revenue', value: NaN })).rejects.toThrow(/finite number/i)
  })

  test('no brand on the server → clear error', async () => {
    const m = mockDb({ maybeSingle: { data: { data: { brands: [] } } } })
    await expect(logBusinessMetric(vdb(WRITE, m.db), { metric: 'Revenue', value: 1000 })).rejects.toThrow(/create one in the Brand module/i)
  })

  test('creates a new metric on the only brand, seeded with one history snapshot', async () => {
    const m = mockDb({ maybeSingle: { data: { data: { brands: [{ name: 'Acme', kpis: [] }] } } } })
    const out = await logBusinessMetric(vdb(WRITE, m.db), { metric: 'Revenue', value: 12000, unit: '$' })
    expect(out).toMatchObject({ brand: 'Acme', label: 'Revenue', value: 12000, unit: '$', created: true })
    const kpis = writtenBrands(m)[0].kpis!
    expect(kpis).toHaveLength(1)
    expect(kpis[0]).toMatchObject({ label: 'Revenue', value: 12000, unit: '$' })
    expect(kpis[0].history).toHaveLength(1)
    expect(kpis[0].history![0].value).toBe(12000)
    expect(typeof kpis[0].id).toBe('string')
  })

  test('updates an existing metric by case-insensitive label, appends history, backfills unit', async () => {
    const blob = {
      brands: [{ name: 'Acme', kpis: [{ id: 'k1', label: 'Revenue', value: 10000, unit: '', history: [{ at: '2026-06-10T00:00:00Z', value: 10000 }] }] }],
    }
    const m = mockDb({ maybeSingle: { data: { data: blob } } })
    const out = await logBusinessMetric(vdb(WRITE, m.db), { metric: 'revenue', value: 12000, unit: '$' })
    expect(out).toMatchObject({ label: 'revenue', value: 12000, unit: '$', created: false })
    const kpi = writtenBrands(m)[0].kpis![0]
    expect(kpi.value).toBe(12000)
    expect(kpi.unit).toBe('$') // backfilled
    expect(kpi.history).toHaveLength(2) // appended
    expect(kpi.history![1].value).toBe(12000)
  })

  test('re-logging the same value does not append a duplicate snapshot', async () => {
    const blob = {
      brands: [{ name: 'Acme', kpis: [{ id: 'k1', label: 'Revenue', value: 12000, unit: '$', history: [{ at: '2026-06-10T00:00:00Z', value: 12000 }] }] }],
    }
    const m = mockDb({ maybeSingle: { data: { data: blob } } })
    await logBusinessMetric(vdb(WRITE, m.db), { metric: 'Revenue', value: 12000 })
    expect(writtenBrands(m)[0].kpis![0].history).toHaveLength(1)
  })

  test('several brands without a name → asks which', async () => {
    const m = mockDb({ maybeSingle: { data: { data: { brands: [{ name: 'Acme', kpis: [] }, { name: 'Beta', kpis: [] }] } } } })
    await expect(logBusinessMetric(vdb(WRITE, m.db), { metric: 'Revenue', value: 1 })).rejects.toThrow(/Which business\?.*Acme.*Beta/i)
  })

  test('several brands with a name → targets the right one; archived excluded', async () => {
    const m = mockDb({
      maybeSingle: { data: { data: { brands: [{ name: 'Acme', kpis: [] }, { name: 'Beta', kpis: [] }, { name: 'Old', archived: true, kpis: [] }] } } },
    })
    const out = await logBusinessMetric(vdb(WRITE, m.db), { metric: 'Leads', value: 25, business: 'beta' })
    expect(out.brand).toBe('Beta')
    const brands = writtenBrands(m)
    expect(brands.find((b) => b.name === 'Beta')!.kpis).toHaveLength(1)
    expect(brands.find((b) => b.name === 'Acme')!.kpis).toHaveLength(0)
  })
})

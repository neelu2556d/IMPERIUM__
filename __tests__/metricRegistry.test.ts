/**
 * THE METRIC REGISTRY (TRAIN 5) - the contract tests.
 *
 * The registry is the one source of truth for every drawable series, so these
 * tests are the door: every entry must carry a valid category, a REAL /app
 * route that exists on disk, and non-empty classifying words; and the counts
 * are pinned to the Vee Library's 34 so a drive-by edit can never silently
 * shrink or bloat the catalog.
 */
import fs from 'fs'
import path from 'path'
import {
  METRIC_REGISTRY,
  MODULE_PRIMARY,
  bindingOptionsForCategory,
  metricsForCategory,
  metricById,
} from '@/lib/insights/metricRegistry'
import { GOAL_CATEGORIES } from '@/lib/goals/categories'
import { coreBindingOptions } from '@/lib/insights/goalGuide'

const DIRECTIONS = ['up', 'down', 'neutral', 'goal']

describe('metric registry entries', () => {
  it('every entry has a valid category', () => {
    for (const m of METRIC_REGISTRY) {
      expect(GOAL_CATEGORIES).toContain(m.category)
    }
  })

  it('ids are unique and snake_case', () => {
    const ids = METRIC_REGISTRY.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/)
  })

  it('every entry has non-empty words, label, and unit', () => {
    for (const m of METRIC_REGISTRY) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.unit.length).toBeGreaterThan(0)
      expect(m.words.length).toBeGreaterThan(0)
      for (const w of m.words) expect(w.trim().length).toBeGreaterThan(0)
    }
  })

  it('every direction is one of the four', () => {
    for (const m of METRIC_REGISTRY) expect(DIRECTIONS).toContain(m.direction)
  })

  it('every href is a real /app route that exists in app/', () => {
    for (const m of METRIC_REGISTRY) {
      expect(m.href.startsWith('/app')).toBe(true)
      const routePath = m.href.split('#')[0].split('?')[0]
      const pageFile = path.join(process.cwd(), 'app', ...routePath.split('/').filter(Boolean), 'page.tsx')
      expect({ href: m.href, exists: fs.existsSync(pageFile) }).toEqual({ href: m.href, exists: true })
    }
  })

  it('wearable sources declare an honest triage order', () => {
    for (const m of METRIC_REGISTRY) {
      if (m.source.kind !== 'wearable') continue
      expect(m.source.providers.length).toBeGreaterThan(0)
      // whoop always outranks oura outranks manual when present
      const order = ['whoop', 'oura', 'manual']
      const idx = m.source.providers.map((p) => order.indexOf(p))
      expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    }
  })
})

describe('metric registry counts (the 34 of the Vee Library)', () => {
  it('matches the snapshot per category', () => {
    const counts = Object.fromEntries(
      GOAL_CATEGORIES.map((c) => [c, metricsForCategory(c).length]),
    )
    expect(counts).toEqual({
      fitness: 5,
      health: 11, // fuel 5 + vitals 6 (per-source triaged)
      mind: 4,
      money: 4,
      career: 0, // covered only by custom tiles (honest gap)
      craft: 0,
      audience: 3,
      people: 0,
      general: 7, // the 7 tile report kinds, one dynamic family each
    })
    expect(METRIC_REGISTRY.length).toBe(34)
  })

  it('exactly the per-lift family and the 7 tile kinds are dynamic', () => {
    const dynamic = METRIC_REGISTRY.filter((m) => m.dynamic).map((m) => m.id)
    expect(dynamic).toEqual([
      'lift_progression',
      'tile_intake', 'tile_count', 'tile_duration', 'tile_rating', 'tile_measure', 'tile_money', 'tile_done',
    ])
  })
})

describe('the binding wire (goalGuide reads the registry)', () => {
  it('every MODULE_PRIMARY points at a real registry entry of that module', () => {
    for (const [module, primary] of Object.entries(MODULE_PRIMARY)) {
      const entry = metricById(primary.entryId)
      expect(entry).not.toBeNull()
      expect(entry!.module).toBe(module)
      expect(primary.metric.length).toBeGreaterThan(0)
      expect(primary.start.length).toBeGreaterThan(0)
    }
  })

  it('coreBindingOptions is the registry option list, notes floor included', () => {
    for (const cat of [...GOAL_CATEGORIES, null]) {
      const opts = bindingOptionsForCategory(cat)
      expect(coreBindingOptions(cat)).toEqual(opts)
      expect(opts).toContain('notes')
      // every offered module is steerable: it has a primary registry metric
      for (const m of opts) expect(MODULE_PRIMARY[m]).toBeDefined()
    }
  })
})

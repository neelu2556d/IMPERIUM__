import { buildTile } from '@/lib/tiles/buildTile'
import { ACCENTS } from '@/lib/tiles/tileRecolor'
import { lintTile } from '@/mcp/src/tiles/lintTile'

/**
 * The in-app builder's brain (lib/tiles/buildTile) must always hand back a
 * finished, lint-clean, full-grade sealed tile - this is what makes the free,
 * no-Claude create path possible. Same deterministic engine scaffold_tile uses.
 */
describe('buildTile', () => {
  test('builds a water tile: intake kind, target, sealed + lint clean', () => {
    const b = buildTile({ prompt: 'water' })
    expect(b.meta.kind).toBe('intake')
    expect(b.meta.key).toMatch(/^[a-z0-9_]+$/)
    expect(b.meta.target).toBeGreaterThan(0)
    expect(b.html).toContain('vitality-tile') // the bridge is present
    expect(lintTile(b.html).errors).toBe(0)
    expect(b.sampleValues).toHaveLength(7)
  })

  test('infers habit / money / duration kinds from plain words', () => {
    expect(buildTile({ prompt: 'gym streak' }).meta.kind).toBe('done')
    const money = buildTile({ prompt: 'daily spend' })
    expect(money.meta.kind).toBe('money')
    expect(money.meta.goalDirection).toBe('down')
    expect(buildTile({ prompt: 'sleep' }).meta.kind).toBe('duration')
  })

  test('an explicit target overrides the inferred goal', () => {
    expect(buildTile({ prompt: 'water', target: 12 }).meta.target).toBe(12)
  })

  test('a custom name is honored', () => {
    expect(buildTile({ prompt: 'water', name: 'Hydration' }).meta.label).toBe('Hydration')
  })

  test('iris accent recolors the tile (no mint left, iris present) and stays lint clean', () => {
    const b = buildTile({ prompt: 'water', accent: 'iris' })
    expect(b.meta.accent).toBe('iris')
    expect(b.html).not.toContain('#6EE7B7')
    expect(b.html).not.toContain('110,231,183')
    expect(b.html).toContain('#A5B4FC')
    // recolor is a pure color swap, so the seal + brand floor still hold
    expect(lintTile(b.html).errors).toBe(0)
  })

  test('mint is the default accent', () => {
    expect(buildTile({ prompt: 'reading' }).meta.accent).toBe('mint')
  })

  test('every new accent recolors clean of mint and stays lint clean', () => {
    for (const accent of ['azure', 'violet', 'rose', 'seafoam'] as const) {
      const b = buildTile({ prompt: 'water', accent })
      expect(b.meta.accent).toBe(accent)
      expect(b.html).not.toContain('#6EE7B7')
      expect(b.html).not.toContain('110,231,183')
      expect(b.html).not.toContain('31,77,61')
      expect(b.html).toContain(ACCENTS[accent].hex)
      // lint runs on the native mint render THEN the pure color swap applies,
      // so the brand floor holds for every accent
      expect(lintTile(b.html).errors).toBe(0)
    }
  })

  test('an accent recolor never repaints the amber caution color', () => {
    const mint = buildTile({ prompt: 'water' }).html
    const rose = buildTile({ prompt: 'water', accent: 'rose' }).html
    const amberCount = (s: string) => s.split('#F59E0B').length - 1
    expect(amberCount(rose)).toBe(amberCount(mint))
  })

  test('every sample value is a finite number (no NaN reaches the chart)', () => {
    for (const prompt of ['water', 'gym streak', 'daily spend', 'sleep', 'weight', 'rate my mood']) {
      const b = buildTile({ prompt })
      expect(b.sampleValues).toHaveLength(7)
      for (const v of b.sampleValues) expect(Number.isFinite(v)).toBe(true)
    }
  })

  test('an empty prompt throws (fail closed, never ship a blank tile)', () => {
    expect(() => buildTile({ prompt: '' })).toThrow()
    expect(() => buildTile({ prompt: '   ' })).toThrow()
  })
})

/**
 * Preset ID cards (2026-07-10 break hunt): every shipped preset whose "good
 * direction" is knowable must carry it into the built tile's meta (the report
 * identity pins first-seen goal_direction FOREVER), and the Calories preset's
 * key must be the honest 'calories', never the -ies-bug 'calory'.
 */
import { PRESETS } from '@/lib/tiles/quickLibrary'

describe('buildTile x quickLibrary presets - direction + key honesty', () => {
  const byId = new Map(PRESETS.map((p) => [p.id, p]))
  const build = (id: string) => {
    const p = byId.get(id)!
    return buildTile({ prompt: p.prompt, name: p.name, unit: p.unit, target: p.target, goalDirection: p.goalDirection })
  }

  test('the savings preset is direction-up (growth is good, never spend-flavored)', () => {
    expect(build('savings').meta.goalDirection).toBe('up')
  })

  test('every knowable-direction preset ships direction up', () => {
    for (const id of ['sleep', 'pushups', 'coldplunge', 'gratitude', 'journaling', 'wakeearly', 'madebed', 'steps', 'workouts', 'water', 'protein', 'meditation', 'reading', 'gymstreak', 'novaping', 'nobuy']) {
      expect(build(id).meta.goalDirection).toBe('up')
    }
  })

  test('down-is-the-win presets stay down', () => {
    for (const id of ['spend', 'screentime', 'alcohol', 'cigarettes']) {
      expect(build(id).meta.goalDirection).toBe('down')
    }
  })

  test("the calories preset keys 'calories', never the misspelled 'calory'", () => {
    expect(build('calories').meta.key).toBe('calories')
  })

  test('every preset still builds lint-clean with its explicit direction', () => {
    for (const p of PRESETS) {
      const b = buildTile({ prompt: p.prompt, name: p.name, unit: p.unit, target: p.target, goalDirection: p.goalDirection })
      expect(lintTile(b.html).errors).toBe(0)
    }
  })
})

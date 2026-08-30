import { AREA_ORDER, findPresets, PRESETS } from '@/lib/tiles/quickLibrary'
import { PRESET_VIZ } from '@/lib/tiles/presetViz'

/**
 * The library is the finder's whole world: every entry must be well-formed
 * (its prompts are separately PROVEN through the real render+lint pipeline -
 * see docs/builds/BUILD80.md), and the matcher must find the obvious things
 * while returning nothing for asks bigger than the library.
 */
describe('quickLibrary - the preset data', () => {
  test('every preset is well-formed and unique', () => {
    const ids = new Set<string>()
    for (const p of PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9]+$/)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(p.label.length).toBeGreaterThan(1)
      expect(p.prompt.trim().length).toBeGreaterThan(2)
      expect(p.keywords.length).toBeGreaterThan(0)
      expect(AREA_ORDER).toContain(p.area)
      // keywords are lowercase (the matcher lowercases only the query)
      for (const k of p.keywords) expect(k).toBe(k.toLowerCase())
    }
  })

  test('every life area has at least three pieces', () => {
    for (const area of AREA_ORDER) {
      expect(PRESETS.filter((p) => p.area === area).length).toBeGreaterThanOrEqual(3)
    }
  })

  // BUILD81: every piece has a personality - a lowercase serif voice line and
  // an honest uppercase mono spec. Never an em dash, never noise.
  test('every preset carries its voice (desc) and its honest spec (foot)', () => {
    for (const p of PRESETS) {
      expect(p.desc.length).toBeGreaterThanOrEqual(12)
      expect(p.desc.length).toBeLessThanOrEqual(60)
      expect(p.desc).toBe(p.desc.toLowerCase()) // the voice is lowercase
      expect(p.desc).not.toContain('\u2014') // never an em dash
      expect(p.foot).toBe(p.foot.toUpperCase()) // the spec is mono uppercase
      expect(p.foot).toContain('·')
      expect(p.foot).not.toContain('\u2014')
    }
  })

  // BUILD81: every piece has its OWN micro-visual on the card stage.
  test('every preset has a bespoke scene in PRESET_VIZ', () => {
    for (const p of PRESETS) {
      expect(PRESET_VIZ[p.id]).toBeTruthy()
    }
    // and no orphan scenes pointing at pieces that no longer exist
    const ids = new Set(PRESETS.map((p) => p.id))
    for (const key of Object.keys(PRESET_VIZ)) {
      expect(ids.has(key)).toBe(true)
    }
  })
})

describe('quickLibrary - the finder', () => {
  test('empty query returns the whole library', () => {
    expect(findPresets('')).toHaveLength(PRESETS.length)
    expect(findPresets('   ')).toHaveLength(PRESETS.length)
  })

  test('the obvious searches land their piece first', () => {
    expect(findPresets('water')[0].id).toBe('water')
    expect(findPresets('mood')[0].id).toBe('mood')
    expect(findPresets('gym streak')[0].id).toBe('gymstreak')
    expect(findPresets('sleep')[0].id).toBe('sleep')
    expect(findPresets('WATER')[0].id).toBe('water') // case-insensitive
  })

  test('keywords and areas match too', () => {
    expect(findPresets('hydration').some((p) => p.id === 'water')).toBe(true)
    expect(findPresets('caffeine').some((p) => p.id === 'coffee')).toBe(true)
    expect(findPresets('money').length).toBeGreaterThanOrEqual(3) // the area word
  })

  test('label-start matches rank before mid-word hits', () => {
    const co = findPresets('co')
    const starts = co.filter((p) => p.label.toLowerCase().startsWith('co'))
    expect(starts.length).toBeGreaterThan(0)
    expect(co.indexOf(starts[0])).toBeLessThan(co.length - 1)
  })

  test('asks bigger than the library return nothing (the Claude card rises)', () => {
    expect(findPresets('youtube subscribers')).toHaveLength(0)
    expect(findPresets('workout logger')).toHaveLength(0)
    expect(findPresets('xyzzy')).toHaveLength(0)
  })
})

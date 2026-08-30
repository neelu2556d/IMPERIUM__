/**
 * Output-safety proof for the in-app tile builder (BUILD77), across ALL SIX
 * template families - the risks buildTile.test.ts (water only) does not cover:
 *
 *  1. RECOLOR COMPLETENESS. recolorTile swaps a fixed set of mint literals. If ANY
 *     template emits a mint color that set misses, an iris tile leaks a mint speck.
 *     We render every family through the REAL infer -> renderTile -> recolor path and
 *     assert not one mint trace survives (case-insensitive), and iris is present.
 *  2. SEED SAFETY. The alive preview feeds buildSample's values through the tile's
 *     chart math (ratio = value / max). A non-finite or all-zero seed would render NaN
 *     bars or divide by zero. We assert every kind + edge target yields finite, chart-
 *     safe values with a today entry.
 *
 * (Executing the sealed tile in a real DOM is the mcp behaviorHarness's job - it runs
 * under node:test, not jest, because its jsdom deps are ESM. This locks the builder-
 * specific guarantees jest CAN prove without that runtime.)
 */
import { buildTile } from '@/lib/tiles/buildTile'
import { lintTile } from '@/mcp/src/tiles/lintTile'
import { sampleValues } from '@/lib/tiles/buildSample'

// One prompt per template family (counter covers intake + count).
const CASES: Array<{ prompt: string; kind: string }> = [
  { prompt: 'water', kind: 'intake' },
  { prompt: 'pushups', kind: 'count' },
  { prompt: 'sleep', kind: 'duration' },
  { prompt: 'rate my mood', kind: 'rating' },
  { prompt: 'weight', kind: 'measure' },
  { prompt: 'daily spend', kind: 'money' },
  { prompt: 'gym streak', kind: 'done' },
]

// Any casing of the mint hue, and both spaced / unspaced rgb triplets.
const MINT_TRACE = /6ee7b7|5dd6a6|1f4d3d|042a1c|110\s*,\s*231\s*,\s*183|31\s*,\s*77\s*,\s*61/i

describe('builder output: recolor completeness across all six template families', () => {
  test.each(CASES)('$prompt ($kind): iris render leaves no mint trace and stays lint clean', ({ prompt, kind }) => {
    const built = buildTile({ prompt, accent: 'iris' })
    expect(built.meta.kind).toBe(kind)
    // not one mint speck survives, in any casing, anywhere in the sealed html
    expect(built.html).not.toMatch(MINT_TRACE)
    // iris actually took
    expect(built.html.toLowerCase()).toContain('#a5b4fc')
    // the recolor is a pure color swap, so the brand + seal floor still holds
    expect(lintTile(built.html).errors).toBe(0)
  })

  test.each(CASES)('$prompt ($kind): mint render is the templates\' native accent (present, lint clean)', ({ prompt }) => {
    const built = buildTile({ prompt })
    expect(built.html.toLowerCase()).toContain('#6ee7b7')
    expect(lintTile(built.html).errors).toBe(0)
  })
})

describe('builder output: sample-seed safety across kinds and edge targets', () => {
  test.each(CASES)('$prompt ($kind): the preview seed is finite, non-empty, chart-safe', ({ prompt }) => {
    const built = buildTile({ prompt })
    const sv = built.sampleValues
    expect(sv).toHaveLength(7)
    for (const v of sv) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    // the chart's denominator (max of the week, or the target) is never zero
    const max = Math.max(built.meta.target ?? 0, ...sv)
    expect(max).toBeGreaterThan(0)
  })

  test('edge targets (tiny / huge / fractional) still seed finite, chart-safe values', () => {
    for (const target of [0.5, 1, 24, 100, 10000]) {
      const built = buildTile({ prompt: 'water', target })
      expect(built.meta.target).toBe(target)
      for (const v of built.sampleValues) expect(Number.isFinite(v)).toBe(true)
      expect(Math.max(target, ...built.sampleValues)).toBeGreaterThan(0)
    }
  })

  test('buildSample never divides to NaN for a kind with no target (measure / money / done)', () => {
    for (const kind of ['measure', 'money', 'done', 'rating'] as const) {
      const sv = sampleValues({ kind })
      expect(sv).toHaveLength(7)
      for (const v of sv) expect(Number.isFinite(v)).toBe(true)
    }
  })

  test('a done tile seeds a real streak shape (mostly 1s, one honest miss)', () => {
    const sv = sampleValues({ kind: 'done' })
    expect(sv.every((v) => v === 0 || v === 1)).toBe(true)
    expect(sv[sv.length - 1]).toBe(1) // done today, so the streak reads live
    expect(sv.filter((v) => v === 1).length).toBeGreaterThanOrEqual(5)
  })
})

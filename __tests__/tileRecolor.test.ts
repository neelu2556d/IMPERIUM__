import { recolorTile, ACCENTS, type TileAccent } from '@/lib/tiles/tileRecolor'

// Every mint literal a template emits, in one string - the recolor must clear
// ALL of them for every non-mint accent, or a swatch would leak mint.
const MINT_LITERALS = ['#6EE7B7', '#5dd6a6', '#1f4d3d', '#042a1c', '110,231,183', '31,77,61']
const TEMPLATE_HTML =
  ':root{--mint:#6EE7B7;--mint-hover:#5dd6a6;--mint-deep:#1f4d3d;--mint-ink:#042a1c;--amber:#F59E0B}' +
  '.glow{background:rgba(110,231,183,.4)}.shell{background:rgba(31,77,61,.16)}' +
  '.pill.caution{color:var(--amber)}'

const NON_MINT: TileAccent[] = ['iris', 'azure', 'violet', 'rose', 'seafoam']

describe('tileRecolor', () => {
  test('mint is the identity (native template accent, unchanged)', () => {
    const html = '<style>:root{--mint:#6EE7B7}</style><body>rgba(110,231,183,.4)</body>'
    expect(recolorTile(html, 'mint')).toBe(html)
  })

  test('iris swaps every mint literal and leaves no mint behind', () => {
    const out = recolorTile(TEMPLATE_HTML, 'iris')
    for (const lit of MINT_LITERALS) expect(out).not.toContain(lit)
    expect(out).toContain('#A5B4FC')
    expect(out).toContain('165,180,252')
  })

  test.each(NON_MINT)('%s recolor leaves no mint literal behind and lands its own hex', (accent) => {
    const out = recolorTile(TEMPLATE_HTML, accent)
    for (const lit of MINT_LITERALS) expect(out).not.toContain(lit)
    expect(out).toContain(ACCENTS[accent].hex)
  })

  test.each(NON_MINT)('%s recolor never touches the amber caution token', (accent) => {
    const out = recolorTile(TEMPLATE_HTML, accent)
    expect(out).toContain('#F59E0B') // caution stays amber
    expect(out).toContain('var(--amber)')
  })

  test('the accent swatch map carries all six accents (and never gold)', () => {
    expect(Object.keys(ACCENTS).sort()).toEqual(['azure', 'iris', 'mint', 'rose', 'seafoam', 'violet'])
    expect(ACCENTS.mint.hex).toBe('#6EE7B7')
    expect(ACCENTS.iris.hex).toBe('#A5B4FC')
    expect(ACCENTS.azure.hex).toBe('#6EA8FF')
    expect(ACCENTS.violet.hex).toBe('#B794F6')
    expect(ACCENTS.rose.hex).toBe('#F49AC2')
    expect(ACCENTS.seafoam.hex).toBe('#7FE3D0')
    for (const a of Object.values(ACCENTS)) {
      expect(a.hex.toUpperCase()).not.toBe('#F59E0B') // never amber
      expect(a.hex.toUpperCase()).not.toBe('#FCD34D') // never gold
    }
  })

  test('every swatch glow is an rgba of its own hex triplet', () => {
    for (const a of Object.values(ACCENTS)) {
      const r = parseInt(a.hex.slice(1, 3), 16)
      const g = parseInt(a.hex.slice(3, 5), 16)
      const b = parseInt(a.hex.slice(5, 7), 16)
      expect(a.glow).toBe(`rgba(${r},${g},${b},.5)`)
    }
  })

  test('recolors are deterministic (same input, same output)', () => {
    expect(recolorTile(TEMPLATE_HTML, 'azure')).toBe(recolorTile(TEMPLATE_HTML, 'azure'))
  })
})

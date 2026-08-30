import { pickBestUsdaFood, type UsdaFood } from '@/lib/nutrition/usda'

const f = (description: string): UsdaFood => ({ description })
const desc = (x: UsdaFood | null) => (x?.description || '')

describe('pickBestUsdaFood — stays in the top-ranked food family', () => {
  // THE BUG: ranked top is the correct raw bell pepper, but the cooked-preference
  // used to skip every "…, raw" and grab the first non-raw food anywhere — which
  // for "bell peppers" is "TACO BELL, Nachos" (350 kcal/100g → 130g = 455 kcal).
  it('keeps raw bell pepper instead of jumping to an unrelated Taco Bell dish', () => {
    const ranked = [
      f('Peppers, bell, green, raw'),
      f('Peppers, bell, red, raw'),
      f('Peppers, bell, yellow, raw'),
      f('TACO BELL, Nachos'),
      f('TACO BELL, Bean Burrito'),
    ]
    const best = pickBestUsdaFood(ranked, 'bell peppers')
    expect(desc(best).toLowerCase()).toContain('peppers, bell')
    expect(desc(best).toLowerCase()).not.toContain('taco bell')
  })

  // Original intent must be preserved: for dry staples, raw = uncooked/dense, so
  // prefer the cooked form OF THE SAME FOOD.
  it('still prefers cooked rice over raw rice (same food family)', () => {
    const ranked = [f('Rice, white, long-grain, raw'), f('Rice, white, long-grain, cooked')]
    const best = pickBestUsdaFood(ranked, 'white rice')
    expect(desc(best).toLowerCase()).toContain('cooked')
  })

  // When the query explicitly wants raw, take the rank winner as-is.
  it('returns the raw top result when the query wants raw (sushi/tartare)', () => {
    const ranked = [f('Tuna, raw'), f('Tuna, cooked')]
    const best = pickBestUsdaFood(ranked, 'tuna sashimi')
    expect(desc(best).toLowerCase()).toContain('raw')
  })

  // A raw whole food with NO same-food cooked sibling must keep its raw top entry,
  // never cross into an unrelated non-raw food.
  it('keeps raw banana rather than crossing to an unrelated bread', () => {
    const ranked = [f('Bananas, raw'), f('Bread, white, commercially prepared')]
    const best = pickBestUsdaFood(ranked, 'banana')
    expect(desc(best).toLowerCase()).toContain('banana')
  })

  // The cooked-swap must NOT fire for raw produce — the ranker already pinned the
  // raw form, and swapping it for a cooked sibling re-broke banana → "Banana, baked".
  it('keeps raw banana — does not swap it for a cooked banana sibling', () => {
    const ranked = [f('Banana, raw'), f('Banana, baked')]
    expect(desc(pickBestUsdaFood(ranked, 'banana')).toLowerCase()).toContain('raw')
  })
  it('keeps raw broccoli rather than the cooked sibling', () => {
    const ranked = [f('Broccoli, raw'), f('Broccoli, Chinese, cooked')]
    expect(desc(pickBestUsdaFood(ranked, 'broccoli')).toLowerCase()).toContain('raw')
  })

  it('returns null for an empty list and the only item for a single', () => {
    expect(pickBestUsdaFood([], 'x')).toBeNull()
    expect(desc(pickBestUsdaFood([f('Peppers, bell, raw')], 'bell pepper'))).toContain('Peppers')
  })
})

import { rankUsdaResults, type UsdaFood } from '@/lib/nutrition/usda'

// Equal base score so our heuristic deltas decide the order deterministically.
const c = (description: string, score = 300): UsdaFood => ({ description, score, dataType: 'Survey (FNDDS)' })
const top = (foods: UsdaFood[], q: string) => (rankUsdaResults(foods, q)[0]?.description || '')

describe('rankUsdaResults — bare produce nouns prefer the plain/raw form', () => {
  it('onion → raw onion, not Onion dip', () => {
    const foods = [c('Onion dip, regular'), c('Onions, raw'), c('Onions, green, cooked'), c('Bread, onion')]
    expect(top(foods, 'onion').toLowerCase()).toContain('onions, raw')
  })

  it('banana → raw banana, not baked banana', () => {
    const foods = [c('Banana, baked'), c('Bananas, raw')]
    expect(top(foods, 'banana').toLowerCase()).toContain('raw')
  })

  it('cucumber → raw cucumber, not cooked', () => {
    const foods = [c('Cucumber, cooked, from fresh, fat added'), c('Cucumber, raw')]
    expect(top(foods, 'cucumber').toLowerCase()).toContain('raw')
  })

  it('broccoli → raw/plain, not a creamed/cheese dish', () => {
    const foods = [c('Broccoli, creamed'), c('Broccoli casserole'), c('Broccoli, raw')]
    expect(top(foods, 'broccoli').toLowerCase()).toContain('raw')
  })

  it('spinach → raw, not creamed spinach', () => {
    const foods = [c('Spinach, creamed'), c('Spinach, raw')]
    expect(top(foods, 'spinach').toLowerCase()).toContain('raw')
  })

  // Plural query, singular USDA lead word (and vice-versa) must still match.
  it('peppers → raw bell pepper, not a dish', () => {
    const foods = [c('Pepper, banana, dip'), c('Peppers, bell, green, raw'), c('Pepper steak')]
    expect(top(foods, 'bell peppers').toLowerCase()).toContain('peppers, bell')
  })
})

describe('rankUsdaResults — staples/meat unaffected (cooked still preferred)', () => {
  it('white rice still prefers cooked over dry/raw', () => {
    const foods = [c('Rice, white, long-grain, raw'), c('Rice, white, long-grain, cooked')]
    expect(top(foods, 'white rice').toLowerCase()).toContain('cooked')
  })

  it('chicken breast still prefers cooked over raw', () => {
    const foods = [c('Chicken, broilers, breast, meat only, raw'), c('Chicken, broilers, breast, meat only, cooked, roasted')]
    expect(top(foods, 'chicken breast').toLowerCase()).toContain('cooked')
  })

  it('oats still prefer cooked oatmeal over raw oats', () => {
    const foods = [c('Oats, raw'), c('Oatmeal, cooked, NFS')]
    expect(top(foods, 'oatmeal').toLowerCase()).toContain('oatmeal')
  })
})

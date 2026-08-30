import { rankUsdaResults, filterBasicResults } from '@/lib/nutrition/usda'

const f = (description: string, score: number, dataType = 'SR Legacy', kcal = 200) => ({
  description,
  score,
  dataType,
  foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: kcal }],
})

describe('rankUsdaResults — common beef foods win', () => {
  const beef = [
    f('Beef, cured, corned beef, canned', 280),
    f('Beef, New Zealand, imported, manufacturing beef, cooked, boiled', 245),
    f('Bologna, beef', 267),
    f('Beef, ground', 268, 'Survey (FNDDS)'),
    f('Beef, NFS', 267, 'Survey (FNDDS)'),
    f('Beef, roast', 267, 'Survey (FNDDS)'),
  ]
  const ranked = rankUsdaResults(beef, 'beef').map((x) => x.description)
  test('a basic "Beef, ..." entry is ranked #1, not corned/imported/bologna', () => {
    expect(['Beef, ground', 'Beef, NFS', 'Beef, roast']).toContain(ranked[0])
  })
  test('corned beef + NZ imported rank below the basics', () => {
    const idxGround = ranked.indexOf('Beef, ground')
    expect(idxGround).toBeLessThan(ranked.indexOf('Beef, cured, corned beef, canned'))
    expect(idxGround).toBeLessThan(
      ranked.indexOf('Beef, New Zealand, imported, manufacturing beef, cooked, boiled')
    )
  })
})

describe('filterBasicResults — Basic drops obscure, differs from Advanced', () => {
  const beef = [
    f('Beef, ground', 268, 'Survey (FNDDS)'),
    f('Beef, cured, corned beef, canned', 280),
    f('Beef, New Zealand, imported, manufacturing beef, cooked, boiled', 245),
  ]
  test('Basic removes corned/imported but keeps Beef, ground', () => {
    const basic = filterBasicResults(beef, 'beef').map((x) => x.description)
    expect(basic).toContain('Beef, ground')
    expect(basic).not.toContain('Beef, cured, corned beef, canned')
    expect(basic).not.toContain(
      'Beef, New Zealand, imported, manufacturing beef, cooked, boiled'
    )
  })
  test('typing the obscure word opts back in (e.g. "corned beef")', () => {
    const basic = filterBasicResults(beef, 'corned beef').map((x) => x.description)
    expect(basic).toContain('Beef, cured, corned beef, canned')
  })
})

describe('rankUsdaResults — plain staple beats dishes', () => {
  const f = (description: string, score: number, dataType = 'Survey (FNDDS)', kcal = 130) => ({
    description,
    score,
    dataType,
    foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: kcal }],
  })
  const rice = [
    f('Dirty rice', 281),
    f('Rice pilaf', 280),
    f('Rice, fried, NFS', 279),
    f('Rice cake', 270),
    f('Rice, cooked, NFS', 268),
  ]
  test('"Rice, cooked, NFS" ranks #1 for query "rice"', () => {
    expect(rankUsdaResults(rice, 'rice')[0].description).toBe('Rice, cooked, NFS')
  })
  test('typing "fried rice" keeps the fried entry rankable', () => {
    const ranked = rankUsdaResults(rice, 'fried rice').map((x) => x.description)
    // fried no longer penalized when the user asked for it
    expect(ranked.indexOf('Rice, fried, NFS')).toBeLessThan(ranked.indexOf('Rice cake'))
  })
})

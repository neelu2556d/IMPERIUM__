import { canonBoost, canonSeedsFor, canonLabel, servingFor, COMMON_FOODS } from '@/lib/nutrition/commonFoods'
import { rankUsdaResults, filterBasicResults, friendlyFoodName, dedupeByDisplayName, extractMacrosPer100g } from '@/lib/nutrition/usda'

const f = (description: string, score = 250, dataType = 'Survey (FNDDS)', kcal = 150) => ({
  description,
  score,
  dataType,
  foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: kcal }],
})

// ─── servingFor unit tests ─────────────────────────────────────────────────

describe('servingFor', () => {
  test('egg -> 1 egg (50g)', () => {
    expect(servingFor('Eggs, Grade A, Large, egg whole', 'eggs')).toEqual({ grams: 50, label: '1 egg' })
  })
  test('chicken breast -> 1 breast (120g)', () => {
    expect(servingFor('Chicken, breast, cooked', 'chicken')).toEqual({ grams: 120, label: '1 breast' })
  })
  test('banana -> 1 banana (118g)', () => {
    expect(servingFor('Banana, raw', 'banana')).toEqual({ grams: 118, label: '1 banana' })
  })
  test('non-canon -> 100g default', () => {
    expect(servingFor('Something obscure', 'xyz')).toEqual({ grams: 100, label: '100g' })
  })
})

// ─── canonBoost unit tests ─────────────────────────────────────────────────

describe('canonBoost', () => {
  test('plain banana beats banana dishes', () => {
    expect(canonBoost('Banana, raw', 'banana')).toBeGreaterThan(canonBoost('Banana, baked', 'banana'))
    expect(canonBoost('Banana split', 'banana')).toBe(0)
  })

  test('chicken breast/thigh are preferred over tail', () => {
    expect(canonBoost('Chicken, breast, cooked', 'chicken')).toBeGreaterThan(canonBoost('Chicken, tail', 'chicken'))
  })

  test('non-matching query returns 0 for any description', () => {
    expect(canonBoost('Banana, raw', 'rice')).toBe(0)
    expect(canonBoost('Chicken, breast', 'salmon')).toBe(0)
  })

  test('returns 0 for empty inputs', () => {
    expect(canonBoost('', 'banana')).toBe(0)
    expect(canonBoost('Banana, raw', '')).toBe(0)
  })

  test('egg whole beats egg white which beats egg dishes', () => {
    const eggWhole = canonBoost('Eggs, Grade A, Large, egg whole', 'egg')
    const eggWhite = canonBoost('Eggs, Grade A, Large, egg white', 'egg')
    const eggBenedict = canonBoost('Egg, Benedict', 'egg')
    expect(eggWhole).toBeGreaterThan(eggWhite)
    expect(eggWhite).toBeGreaterThan(eggBenedict)
  })

  test('beef ground / beef steak beat beef burgundy', () => {
    const ground = canonBoost('Beef, ground', 'beef')
    const steak = canonBoost('Beef, steak, NFS', 'beef')
    const burgundy = canonBoost('Beef burgundy', 'beef')
    expect(ground).toBeGreaterThan(burgundy)
    expect(steak).toBeGreaterThan(burgundy)
  })
})

// ─── filterBasicResults raw-fruit fix ─────────────────────────────────────

describe('filterBasicResults (usda.ts) keeps raw fruit', () => {
  test('Banana, raw is NOT dropped in Basic', () => {
    const out = filterBasicResults([f('Banana, raw'), f('Banana chips')], 'banana').map((x) => x.description)
    expect(out).toContain('Banana, raw')
  })

  test('Bananas, raw is NOT dropped', () => {
    const out = filterBasicResults([f('Bananas, raw'), f('Banana pudding')], 'banana').map((x) => x.description)
    expect(out).toContain('Bananas, raw')
  })

  test('Chicken, raw is still dropped (raw-penalty from ranking, filter passes through)', () => {
    // The filter no longer drops raw outright — ranking penalizes it instead.
    // But we verify the filter itself no longer removes it (canon boost handles fruit).
    const items = [f('Chicken, raw'), f('Chicken, grilled')]
    const out = filterBasicResults(items, 'chicken').map((x) => x.description)
    // Both survive the filter now; ranking deprioritizes raw for non-fruit
    expect(out).toContain('Chicken, raw')
    expect(out).toContain('Chicken, grilled')
  })
})

// ─── rankForPicker-style ordering with canonBoost applied ─────────────────

// Pure helper simulating what rankForPicker does: rank + apply canon boost.
function rankWithCanon(foods: ReturnType<typeof f>[], query: string) {
  const ranked = rankUsdaResults(foods, query)
  const scored = ranked.map((food) => {
    const boost = canonBoost(food.description || '', query)
    return { food, boost }
  })
  // Stable sort: items with higher boost come first; within same boost, keep
  // existing rankUsdaResults order (already sorted, so we just partition).
  scored.sort((a, b) => b.boost - a.boost)
  return scored.map((r) => r.food.description)
}

describe('rankForPicker-style: canon forms land at index 0', () => {
  test('banana: "*, raw" form beats dishes and dehydrated', () => {
    const bananaSet = [
      f('Bananas, dehydrated, or banana powder'),
      f('Banana, baked'),
      f('Banana, raw'),
      f('Banana chips'),
      f('Banana nectar'),
      f('Banana pudding'),
      f('Banana split'),
      f('Bananas, raw'),
    ]
    const ranked = rankWithCanon(bananaSet, 'banana')
    // The first result should be one of the raw banana forms
    expect(['Banana, raw', 'Bananas, raw']).toContain(ranked[0])
  })

  test('egg: whole/scrambled/egg white beat egg dishes', () => {
    const eggSet = [
      f('Eggs, Grade A, Large, egg white'),
      f('Eggs, Grade A, Large, egg whole'),
      f('Egg, Benedict'),
      f('Egg, creamed'),
      f('Egg, deviled'),
      f('Egg burrito'),
      f('Egg, whole, raw'),
    ]
    const ranked = rankWithCanon(eggSet, 'egg')
    // Top result should be a preferred egg form
    expect(['Eggs, Grade A, Large, egg whole', 'Eggs, Grade A, Large, egg white', 'Egg, whole, raw']).toContain(ranked[0])
    // egg whole should beat egg white
    const wholeIdx = ranked.indexOf('Eggs, Grade A, Large, egg whole')
    const whiteIdx = ranked.indexOf('Eggs, Grade A, Large, egg white')
    expect(wholeIdx).toBeLessThan(whiteIdx)
  })

  test('beef: ground/steak/NFS beat beef burgundy and stew', () => {
    const beefSet = [
      f('Beef burgundy'),
      f('Beef, cured, corned beef, canned'),
      f('Stew, beef'),
      f('Beef, ground'),
      f('Beef, NFS'),
      f('Beef, oxtails'),
      f('Beef, roast'),
      f('Beef, steak, NFS'),
    ]
    const ranked = rankWithCanon(beefSet, 'beef')
    expect(['Beef, ground', 'Beef, NFS', 'Beef, steak, NFS']).toContain(ranked[0])
    // Ground beef must be above beef burgundy
    const groundIdx = ranked.indexOf('Beef, ground')
    const burgundyIdx = ranked.indexOf('Beef burgundy')
    expect(groundIdx).toBeLessThan(burgundyIdx)
  })

  test('chicken: breast/thigh beat orange chicken and soup', () => {
    const chickenSet = [
      f('Chicken, chicken roll, roasted'),
      f('Orange chicken'),
      f('Soup, chicken'),
      f('Chicken, back'),
      f('Chicken, ground'),
      f('Chicken, breast, cooked'),
      f('Chicken, tail'),
    ]
    const ranked = rankWithCanon(chickenSet, 'chicken')
    expect(['Chicken, breast, cooked', 'Chicken, ground']).toContain(ranked[0])
    // Breast should beat tail
    const breastIdx = ranked.indexOf('Chicken, breast, cooked')
    const tailIdx = ranked.indexOf('Chicken, tail')
    expect(breastIdx).toBeLessThan(tailIdx)
  })
})

// ─── canonSeedsFor ────────────────────────────────────────────────────────

describe('canonSeedsFor', () => {
  test('bare "chicken" seeds breast + thigh', () => {
    expect(canonSeedsFor('chicken')).toEqual(['chicken breast', 'chicken thigh'])
  })
  test('specific "chicken wing" does NOT seed', () => {
    expect(canonSeedsFor('chicken wing')).toEqual([])
  })
  test('bare "banana" has no seeds', () => {
    expect(canonSeedsFor('banana')).toEqual([])
  })
  test('bare "turkey" seeds breast + ground turkey', () => {
    expect(canonSeedsFor('turkey')).toEqual(['turkey breast', 'ground turkey'])
  })
  test('bare "pork" seeds chop + loin', () => {
    expect(canonSeedsFor('pork')).toEqual(['pork chop', 'pork loin'])
  })
  test('bare "steak" seeds beef steak + sirloin steak', () => {
    expect(canonSeedsFor('steak')).toEqual(['beef steak', 'sirloin steak'])
  })
  test('plural "chickens" also seeds', () => {
    expect(canonSeedsFor('chickens')).toEqual(['chicken breast', 'chicken thigh'])
  })
  test('empty string returns []', () => {
    expect(canonSeedsFor('')).toEqual([])
  })
})

// ─── canonLabel ───────────────────────────────────────────────────────────

describe('canonLabel', () => {
  test('egg whole -> Whole egg', () => {
    expect(canonLabel('Eggs, Grade A, Large, egg whole', 'eggs')).toBe('Whole egg')
  })
  test('chicken breast -> Chicken breast', () => {
    expect(canonLabel('Chicken, breast, boneless, skinless, raw', 'chicken')).toBe('Chicken breast')
  })
  test('banana raw -> Banana', () => {
    expect(canonLabel('Banana, raw', 'banana')).toBe('Banana')
  })
  test('null when not a canon prefer', () => {
    expect(canonLabel('Beef, oxtails', 'beef')).toBeNull()
  })
  test('null for empty inputs', () => {
    expect(canonLabel('', 'banana')).toBeNull()
    expect(canonLabel('Banana, raw', '')).toBeNull()
  })
  test('ground beef -> Ground beef', () => {
    expect(canonLabel('Beef, ground', 'beef')).toBe('Ground beef')
  })
  test('turkey breast -> Turkey breast', () => {
    expect(canonLabel('Turkey, breast, cooked', 'turkey')).toBe('Turkey breast')
  })
})

// ─── friendlyFoodName ─────────────────────────────────────────────────────

describe('friendlyFoodName', () => {
  test('drops Grade A / Large noise', () => {
    expect(friendlyFoodName('Eggs, Grade A, Large, egg whole').toLowerCase()).not.toContain('grade a')
  })
  test('non-empty for a plain cut', () => {
    expect(friendlyFoodName('Beef, oxtails')).toMatch(/beef/i)
  })
  test('drops boneless / skinless noise', () => {
    const result = friendlyFoodName('Chicken, breast, boneless, skinless, raw')
    expect(result.toLowerCase()).not.toContain('boneless')
    expect(result.toLowerCase()).not.toContain('skinless')
  })
  test('does not return empty string', () => {
    expect(friendlyFoodName('Beef, Grade A, Large').length).toBeGreaterThan(0)
  })
  test('capitalizes first letter', () => {
    const result = friendlyFoodName('beef, ground')
    expect(result[0]).toBe(result[0].toUpperCase())
  })
})

// ─── dedupeByDisplayName ──────────────────────────────────────────────────

const cand = (displayName: string, fdcId: number, kcal = 150) => ({
  fdcId,
  description: displayName,
  displayName,
  serving: { grams: 100, label: '100g' },
  per100: { kcal, protein: 0, carbs: 0, fat: 0 },
})

describe('dedupeByDisplayName', () => {
  test('keeps first of each label, drops later duplicates', () => {
    const r = dedupeByDisplayName([
      { fdcId: 1, description: 'a', displayName: 'Scrambled egg', serving: { grams: 50, label: '1 egg' }, per100: { kcal: 1, protein: 0, carbs: 0, fat: 0 } },
      { fdcId: 2, description: 'b', displayName: 'Scrambled egg', serving: { grams: 50, label: '1 egg' }, per100: { kcal: 2, protein: 0, carbs: 0, fat: 0 } },
      { fdcId: 3, description: 'c', displayName: 'Whole egg', serving: { grams: 50, label: '1 egg' }, per100: { kcal: 3, protein: 0, carbs: 0, fat: 0 } },
    ])
    expect(r.map((c) => c.displayName)).toEqual(['Scrambled egg', 'Whole egg'])
    expect(r[0].fdcId).toBe(1)
  })

  test('case-insensitive dedup: "ground beef" and "Ground beef" collapse', () => {
    const r = dedupeByDisplayName([
      cand('Ground beef', 10),
      cand('ground beef', 11),
      cand('Chicken breast', 12),
    ])
    expect(r).toHaveLength(2)
    expect(r[0].fdcId).toBe(10)
    expect(r[1].displayName).toBe('Chicken breast')
  })

  test('no duplicates: returns all items unchanged', () => {
    const input = [cand('Apple', 1), cand('Banana', 2), cand('Orange', 3)]
    expect(dedupeByDisplayName(input)).toHaveLength(3)
  })

  test('empty array returns empty array', () => {
    expect(dedupeByDisplayName([])).toEqual([])
  })
})

// ─── Audit fixes (search audit 2026-05) ───────────────────────────────────

describe('audit fixes', () => {
  test('specific query "chicken breast" does NOT boost a thigh/drumstick', () => {
    const breast = canonBoost('Chicken, breast, cooked', 'chicken breast')
    const thigh = canonBoost('Chicken, thigh, cooked', 'chicken breast')
    expect(breast).toBeGreaterThan(0)
    expect(thigh).toBe(0)
  })
  test('"ground beef" still boosts Beef, ground (same label, different pattern)', () => {
    expect(canonBoost('Beef, ground', 'ground beef')).toBeGreaterThan(0)
  })
  test('generic "chicken" boosts all cuts', () => {
    expect(canonBoost('Chicken, thigh, cooked', 'chicken')).toBeGreaterThan(0)
  })
  test('macro-derived kcal fallback for a no-energy oil', () => {
    const m = extractMacrosPer100g({ foodNutrients: [{ nutrientName: 'Total lipid (fat)', unitName: 'G', value: 100 }] } as any)
    expect(m.kcal).toBe(900)
  })
})

// ─── Coverage sanity ──────────────────────────────────────────────────────

describe('COMMON_FOODS coverage', () => {
  test('has at least 30 entries', () => {
    expect(COMMON_FOODS.length).toBeGreaterThanOrEqual(30)
  })
  test('all prefer entries have pattern and label', () => {
    for (const food of COMMON_FOODS) {
      for (const pref of food.prefer) {
        expect(pref).toHaveProperty('pattern')
        expect(pref).toHaveProperty('label')
        expect(typeof pref.label).toBe('string')
        expect(pref.label.length).toBeGreaterThan(0)
        // No em/en dashes in labels
        expect(pref.label).not.toMatch(/[—–]/)
      }
    }
  })
})

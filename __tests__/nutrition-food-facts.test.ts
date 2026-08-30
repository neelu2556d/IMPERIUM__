import { FOOD_FACTS, FACT_TAGS, type FactMacro } from '@/lib/nutrition/foodFacts'

const VALID_MACROS: FactMacro[] = ['protein', 'carbs', 'fat', 'fiber', 'hydration', 'general']

describe('FOOD_FACTS', () => {
  test('has a large, varied pool', () => {
    expect(FOOD_FACTS.length).toBeGreaterThanOrEqual(90)
    expect(FACT_TAGS.length).toBeGreaterThan(0)
  })

  test('every highlight is an exact substring of its text (so it always colors)', () => {
    const broken = FOOD_FACTS.filter((f) => !f.text.includes(f.highlight))
    expect(broken.map((f) => f.text)).toEqual([])
  })

  test('every macro is a known tone', () => {
    const bad = FOOD_FACTS.filter((f) => !VALID_MACROS.includes(f.macro))
    expect(bad.map((f) => f.text)).toEqual([])
  })

  test('no exact-duplicate fact text', () => {
    const seen = new Set<string>()
    const dups: string[] = []
    for (const f of FOOD_FACTS) {
      if (seen.has(f.text)) dups.push(f.text)
      seen.add(f.text)
    }
    expect(dups).toEqual([])
  })
})

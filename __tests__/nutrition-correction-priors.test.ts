import { buildCorrectionPriors } from '@/lib/nutrition/prompt'

describe('buildCorrectionPriors', () => {
  test('returns null when there are no usable corrections', () => {
    expect(buildCorrectionPriors([])).toBeNull()
    expect(
      buildCorrectionPriors([{ guessedName: null, correctedName: 'Tuna' }])
    ).toBeNull()
    // a "correction" that did not change the name carries no signal
    expect(
      buildCorrectionPriors([{ guessedName: 'Tuna', correctedName: 'tuna' }])
    ).toBeNull()
  })

  test('formats each guess→correction pair', () => {
    const out = buildCorrectionPriors([
      { guessedName: 'Pulled pork', correctedName: 'Tuna, canned' },
    ])
    expect(out).toContain('PERSONAL CORRECTION HISTORY')
    expect(out).toContain('"Pulled pork"')
    expect(out).toContain('"Tuna, canned"')
  })

  test('dedups repeated guess→correction pairs (case-insensitive)', () => {
    const out = buildCorrectionPriors([
      { guessedName: 'pork', correctedName: 'tuna' },
      { guessedName: 'Pork', correctedName: 'Tuna' },
    ])
    const occurrences = (out ?? '').split('\n').filter((l) => l.startsWith('- ')).length
    expect(occurrences).toBe(1)
  })

  test('caps the number of priors at 12', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      guessedName: `guess ${i}`,
      correctedName: `fixed ${i}`,
    }))
    const out = buildCorrectionPriors(many)
    const lines = (out ?? '').split('\n').filter((l) => l.startsWith('- '))
    expect(lines.length).toBe(12)
  })
})

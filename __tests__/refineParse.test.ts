import { parseRefine, convertAmount, friendlyRound } from '@/lib/tiles/refineParse'

describe('refineParse', () => {
  test('sets the goal from a number', () => {
    const r = parseRefine('make the goal 10')
    expect(r.patch.target).toBe(10)
    expect(r.did.join(' ')).toContain('goal set to 10')
    expect(r.warn).toBeUndefined()
  })

  test('many casual goal phrasings all land the number', () => {
    expect(parseRefine('make it 10').patch.target).toBe(10)
    expect(parseRefine('cap it at 50').patch.target).toBe(50)
    expect(parseRefine('goal of 3').patch.target).toBe(3)
    expect(parseRefine('aim for 8').patch.target).toBe(8)
    expect(parseRefine('target 12').patch.target).toBe(12)
    expect(parseRefine('up it to 20').patch.target).toBe(20)
  })

  test('"cap it at 50" also reads as keep-it-under (down)', () => {
    const r = parseRefine('cap it at 50')
    expect(r.patch.target).toBe(50)
    expect(r.patch.goalDirection).toBe('down')
  })

  test('"up it to 20" never falsely claims a direction change', () => {
    const r = parseRefine('up it to 20')
    expect(r.patch.target).toBe(20)
    expect(r.patch.goalDirection).toBeUndefined()
  })

  test('"raise the goal" with a known target nudges it up deterministically', () => {
    const r = parseRefine('raise the goal', { target: 10 })
    expect(r.patch.target).toBe(11)
    expect(r.did.join(' ')).toContain('goal raised to 11')
  })

  test('"lower the goal" with a known target eases it down, never below 1', () => {
    expect(parseRefine('lower the goal', { target: 10 }).patch.target).toBe(9)
    expect(parseRefine('lower the goal', { target: 1 }).patch.target).toBeUndefined()
  })

  test('"raise the goal" without a known target warns instead of guessing', () => {
    const r = parseRefine('raise the goal')
    expect(r.patch.target).toBeUndefined()
    expect(r.warn).toBeTruthy()
    expect(r.warn).toContain('number')
  })

  test('"lower the goal" is a target ask, not a direction flip', () => {
    const r = parseRefine('lower the goal', { target: 20 })
    expect(r.patch.target).toBe(18)
    expect(r.patch.goalDirection).toBeUndefined()
  })

  test('"raise the goal to 20" prefers the explicit number', () => {
    expect(parseRefine('raise the goal to 20', { target: 10 }).patch.target).toBe(20)
  })

  test('changes the unit and canonicalizes it', () => {
    expect(parseRefine('track in km').patch.unit).toBe('km')
    expect(parseRefine('use miles').patch.unit).toBe('mi')
    expect(parseRefine('minutes please').patch.unit).toBe('min')
  })

  test('a wide unit vocabulary canonicalizes', () => {
    expect(parseRefine('track it in ounces').patch.unit).toBe('oz')
    expect(parseRefine('in liters').patch.unit).toBe('L')
    expect(parseRefine('litres actually').patch.unit).toBe('L')
    expect(parseRefine('count it in grams').patch.unit).toBe('g')
    expect(parseRefine('in mg please').patch.unit).toBe('mg')
    expect(parseRefine('track glasses').patch.unit).toBe('glasses')
    expect(parseRefine('cups instead').patch.unit).toBe('cups')
    expect(parseRefine('in kilometers').patch.unit).toBe('km')
    expect(parseRefine('count steps').patch.unit).toBe('steps')
    expect(parseRefine('in reps').patch.unit).toBe('reps')
    expect(parseRefine('pages read').patch.unit).toBe('pages')
    expect(parseRefine('hours please').patch.unit).toBe('hours')
    expect(parseRefine('track calories').patch.unit).toBe('cal')
  })

  test('"log it in dollars" tracks money with a warm confirmation', () => {
    const r = parseRefine('log it in dollars')
    expect(r.patch.unit).toBe('$')
    expect(r.did.join(' ')).toContain('now tracking in dollars')
  })

  test('renames from "call it X" and title-cases it', () => {
    const r = parseRefine('call it morning run')
    expect(r.patch.name).toBe('Morning Run')
  })

  test('rename works across its synonyms', () => {
    expect(parseRefine('name it focus time').patch.name).toBe('Focus Time')
    expect(parseRefine('rename to deep work').patch.name).toBe('Deep Work')
    expect(parseRefine('rename it to deep work').patch.name).toBe('Deep Work')
    expect(parseRefine('lets call it pages').patch.name).toBe('Pages')
    expect(parseRefine('title it night walks').patch.name).toBe('Night Walks')
  })

  test('a large goal with a thousands separator parses fully (10,000 not 10)', () => {
    expect(parseRefine('make the goal 10,000').patch.target).toBe(10000)
    expect(parseRefine('set it to 2,500 steps').patch.target).toBe(2500)
  })

  test('a rename preserves original casing (never relies on lowercase length)', () => {
    // matched on the original text, so accented / mixed-case names survive intact
    expect(parseRefine('call it Über Focus').patch.name).toBe('Über Focus')
    expect(parseRefine('name it MorningPages').patch.name).toBe('MorningPages')
  })

  test('a rename does not also grab a unit or number from the new name', () => {
    const r = parseRefine('call it 5k km run')
    expect(r.patch.name).toBe('5k Km Run')
    expect(r.patch.unit).toBeUndefined()
    expect(r.patch.target).toBeUndefined()
  })

  test('a rename caps at 24 characters', () => {
    const r = parseRefine('call it the very long morning hydration ritual tracker')
    expect((r.patch.name ?? '').length).toBeLessThanOrEqual(24)
  })

  test('flips goal direction down for "under / less / cut"', () => {
    expect(parseRefine('keep it under').patch.goalDirection).toBe('down')
    expect(parseRefine('aim for less').patch.goalDirection).toBe('down')
    expect(parseRefine('less is better').patch.goalDirection).toBe('down')
    expect(parseRefine('under budget').patch.goalDirection).toBe('down')
    expect(parseRefine('cut it down').patch.goalDirection).toBe('down')
  })

  test('flips goal direction up for explicit "more is better" phrasings', () => {
    expect(parseRefine('aim higher').patch.goalDirection).toBe('up')
    expect(parseRefine('more is better').patch.goalDirection).toBe('up')
    expect(parseRefine('count it up').patch.goalDirection).toBe('up')
  })

  test('recolors the accent by word', () => {
    expect(parseRefine('make it iris').patch.accent).toBe('iris')
    expect(parseRefine('go lavender').patch.accent).toBe('iris')
    expect(parseRefine('back to mint').patch.accent).toBe('mint')
    expect(parseRefine('go green').patch.accent).toBe('mint')
  })

  test('"dress it in iris" works', () => {
    const r = parseRefine('dress it in iris')
    expect(r.patch.accent).toBe('iris')
    expect(r.did.join(' ')).toContain('accent set to iris')
  })

  test('the new accents parse from their color families', () => {
    expect(parseRefine('in azure').patch.accent).toBe('azure')
    expect(parseRefine('make it blue').patch.accent).toBe('azure')
    expect(parseRefine('go violet').patch.accent).toBe('violet')
    expect(parseRefine('purple please').patch.accent).toBe('violet')
    expect(parseRefine('make it rose').patch.accent).toBe('rose')
    expect(parseRefine('pink it').patch.accent).toBe('rose')
    expect(parseRefine('seafoam').patch.accent).toBe('seafoam')
    expect(parseRefine('teal would be nice').patch.accent).toBe('seafoam')
  })

  test('gold and red are refused with a helpful warn (color law)', () => {
    const r = parseRefine('make it gold')
    expect(r.patch.accent).toBeUndefined()
    expect(r.warn).toBeTruthy()
    expect(r.warn).toContain('reserved')
    expect(parseRefine('make it red').patch.accent).toBeUndefined()
  })

  test('composes several changes in one line', () => {
    const r = parseRefine('track in km and make the goal 5')
    expect(r.patch.unit).toBe('km')
    expect(r.patch.target).toBe(5)
    expect(r.did.length).toBeGreaterThanOrEqual(2)
  })

  test('every did entry maps to a real patch field (no false claims)', () => {
    const r = parseRefine('make it azure and track in oz and aim for 8')
    expect(r.patch.accent).toBe('azure')
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBe(8)
    expect(r.did).toHaveLength(3)
    expect(r.warn).toBeUndefined()
  })

  test('a done-kind tile refuses a number goal instead of claiming one', () => {
    const r = parseRefine('make the goal 10', { kind: 'done' })
    expect(r.patch.target).toBeUndefined()
    expect(r.warn).toBeTruthy()
    expect(r.warn).toContain('done')
  })

  test('a done-kind tile still takes non-goal changes', () => {
    const r = parseRefine('make it azure', { kind: 'done' })
    expect(r.patch.accent).toBe('azure')
    expect(r.warn).toBeUndefined()
  })

  test('warns (no patch) on unparseable input', () => {
    const r = parseRefine('asdf qwerty zzz')
    expect(r.warn).toBeTruthy()
    expect(Object.keys(r.patch)).toHaveLength(0)
  })

  test('the unparseable warn suggests what works', () => {
    const w = parseRefine('hmm').warn ?? ''
    expect(w).toContain('goal')
    expect(w).toContain('call it')
  })

  test('warns on empty input', () => {
    expect(parseRefine('').warn).toBeTruthy()
    expect(parseRefine('   ').warn).toBeTruthy()
  })
})

describe('the unit brain (same-family unit changes convert the goal)', () => {
  test('Alex\'s live bug: "measure it in ounces" on 11 glasses converts to 88 oz', () => {
    const r = parseRefine('measure it in ounces', { unit: 'glasses', target: 11 })
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBe(88)
    expect(r.did.join(' ')).toContain('switched to oz, your 11 glasses became 88 oz')
    expect(r.warn).toBeUndefined()
  })

  test('bottles -> oz converts through ml and rounds friendly (4 bottles -> 70 oz)', () => {
    const r = parseRefine('track it in ounces', { unit: 'bottles', target: 4 })
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBe(70)
    expect(r.did.join(' ')).toContain('your 4 bottles became 70 oz')
  })

  test('oz -> liters converts and keeps a human decimal (88 oz -> 2.5 L)', () => {
    const r = parseRefine('use liters instead', { unit: 'oz', target: 88 })
    expect(r.patch.unit).toBe('L')
    expect(r.patch.target).toBe(2.5)
    expect(r.did.join(' ')).toContain('your 88 oz became 2.5 L')
  })

  test('km -> miles converts (10 km -> 6 mi)', () => {
    const r = parseRefine('track in miles', { unit: 'km', target: 10 })
    expect(r.patch.unit).toBe('mi')
    expect(r.patch.target).toBe(6)
    expect(r.did.join(' ')).toContain('your 10 km became 6 mi')
  })

  test('"switch from glasses to ounces" lands on the DESTINATION unit (verify MED-2)', () => {
    const r = parseRefine('switch from glasses to ounces', { unit: 'glasses', target: 11 })
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBe(88)
  })

  test('a done tile never gains a goal via conversion, label change only (verify MED-1)', () => {
    const r = parseRefine('track it in ounces', { unit: 'glasses', target: 11, kind: 'done' })
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBeUndefined()
    expect(r.did.join(' ')).not.toMatch(/became|goal/)
  })

  test('kg -> lb converts (80 kg -> 175 lb)', () => {
    const r = parseRefine('in pounds please', { unit: 'kg', target: 80 })
    expect(r.patch.unit).toBe('lb')
    expect(r.patch.target).toBe(175)
    expect(r.did.join(' ')).toContain('your 80 kg became 175 lb')
  })

  test('cross-family (glasses -> km) refuses to convert and says label only', () => {
    const r = parseRefine('track it in km', { unit: 'glasses', target: 11 })
    expect(r.patch.unit).toBe('km')
    expect(r.patch.target).toBeUndefined()
    expect(r.did.join(' ')).toContain('label only')
    expect(r.did.join(' ')).toContain('goal stays 11')
  })

  test('steps stay unconvertible (10,000 steps -> miles keeps the goal)', () => {
    const r = parseRefine('track in miles', { unit: 'steps', target: 10000 })
    expect(r.patch.unit).toBe('mi')
    expect(r.patch.target).toBeUndefined()
    expect(r.did.join(' ')).toContain('goal stays 10,000')
  })

  test('an explicit goal in the same line WINS over conversion', () => {
    const r = parseRefine('track it in ounces and cap it at 100', { unit: 'glasses', target: 11 })
    expect(r.patch.unit).toBe('oz')
    expect(r.patch.target).toBe(100)
    expect(r.did.join(' ')).toContain('goal set to 100')
    expect(r.did.join(' ')).not.toContain('became')
  })

  test('repeating the same unit ask never re-converts (no drift)', () => {
    const first = parseRefine('track it in ounces', { unit: 'glasses', target: 11 })
    expect(first.patch.target).toBe(88)
    const again = parseRefine('track it in ounces', { unit: 'oz', target: 88 })
    expect(again.patch.unit).toBe('oz')
    expect(again.patch.target).toBeUndefined()
    expect(again.did.join(' ')).not.toContain('became')
  })

  test('an explicit goal set later in the new unit is never re-converted', () => {
    const r = parseRefine('make the goal 100', { unit: 'oz', target: 88 })
    expect(r.patch.target).toBe(100)
    expect(r.patch.unit).toBeUndefined()
  })

  test('a unit change with no known current unit or goal just relabels honestly', () => {
    const noUnit = parseRefine('track it in ounces', { target: 11 })
    expect(noUnit.patch.unit).toBe('oz')
    expect(noUnit.patch.target).toBeUndefined()
    expect(noUnit.did.join(' ')).toContain('now tracking in oz')
    const noGoal = parseRefine('track it in ounces', { unit: 'glasses' })
    expect(noGoal.patch.target).toBeUndefined()
    expect(noGoal.did.join(' ')).toContain('now tracking in oz')
  })

  test('convertAmount converts within a family and refuses across families', () => {
    expect(convertAmount(11, 'glasses', 'oz')).toBeCloseTo(88, 3)
    expect(convertAmount(1, 'L', 'ml')).toBe(1000)
    expect(convertAmount(2, 'hours', 'min')).toBe(120)
    expect(convertAmount(11, 'glasses', 'km')).toBeNull()
    expect(convertAmount(10000, 'steps', 'km')).toBeNull()
    expect(convertAmount(5, '$', 'oz')).toBeNull()
  })

  test('friendlyRound: exact conversions keep their number, inexact snap to the grid', () => {
    expect(friendlyRound(88.0001)).toBe(88) // exact-conversion hair
    expect(friendlyRound(80000)).toBe(80000) // kg -> g exact
    expect(friendlyRound(2.6)).toBe(2.5) // nearest 0.5 under 5
    expect(friendlyRound(6.21)).toBe(6) // nearest 1 under 20
    expect(friendlyRound(17.3)).toBe(17)
    expect(friendlyRound(92.98)).toBe(95) // nearest 5 under 200
    expect(friendlyRound(176.37)).toBe(175)
    expect(friendlyRound(1233.7)).toBe(1250) // nearest 50 under 2000
    expect(friendlyRound(2602.47)).toBe(2600) // nearest 100 under 20000
    expect(friendlyRound(23456.7)).toBe(23500) // nearest 500 beyond
    expect(friendlyRound(0.7)).toBe(0.5) // tiny values still land above zero
  })
})

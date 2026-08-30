import { detectGoalUnit, normalizeGoalUnit, unitToBackfill } from '@/lib/goals/goalUnit'

describe('detectGoalUnit', () => {
  it('detects pounds from an explicit unit word', () => {
    expect(detectGoalUnit('225-Pound Bench Press')).toBe('lb')
    expect(detectGoalUnit('bench 225 lbs')).toBe('lb')
    expect(detectGoalUnit('bench 225 lb')).toBe('lb')
  })

  it('detects kg from an explicit unit word', () => {
    expect(detectGoalUnit('squat 140kg')).toBe('kg')
    expect(detectGoalUnit('100 kilo deadlift')).toBe('kg')
    expect(detectGoalUnit('deadlift 180 kilograms')).toBe('kg')
  })

  it('reads the unit out of the AI-cleaned title when the raw title omits it (THE bug)', () => {
    // raw "225 bench" has no unit word; the AI cleanTitle does — the brain must
    // see the unit so a kg account does not read "225 kg" for a pounds goal.
    expect(detectGoalUnit('225 bench', '225-Pound Bench Press')).toBe('lb')
  })

  it('returns null when no weight/length/rep/time unit word is present', () => {
    // null = "no stated unit", so the caller falls back to the account's unit.
    expect(detectGoalUnit('225 bench')).toBeNull()
    expect(detectGoalUnit('get a bigger bench')).toBeNull()
    expect(detectGoalUnit('reach 1000 subscribers')).toBeNull()
    expect(detectGoalUnit('save 10k this year')).toBeNull()
  })

  it('detects length, reps, and time units', () => {
    expect(detectGoalUnit('gain 10 cm on my flexibility')).toBe('cm')
    expect(detectGoalUnit('do 20 reps of pull ups')).toBe('reps')
    expect(detectGoalUnit('hold a 90 second plank')).toBe('sec')
  })

  it('never mistakes a unit substring inside another word', () => {
    expect(detectGoalUnit('release 3 albums')).toBeNull()   // "lb" inside "albums"
    expect(detectGoalUnit('build a compound')).toBeNull()    // "pound" inside "compound"
  })

  it('scans every text passed and ignores null/undefined gaps', () => {
    expect(detectGoalUnit(null, undefined, 'bench 100 kg')).toBe('kg')
    expect(detectGoalUnit()).toBeNull()
  })
})

describe('normalizeGoalUnit', () => {
  it('maps free-text stored units to a canonical unit', () => {
    expect(normalizeGoalUnit('lb')).toBe('lb')
    expect(normalizeGoalUnit('lbs')).toBe('lb')
    expect(normalizeGoalUnit('Pounds')).toBe('lb')
    expect(normalizeGoalUnit('kg')).toBe('kg')
    expect(normalizeGoalUnit('kilograms')).toBe('kg')
    expect(normalizeGoalUnit('cm')).toBe('cm')
    expect(normalizeGoalUnit('reps')).toBe('reps')
  })

  it('returns null for a non-canonical free-text unit', () => {
    expect(normalizeGoalUnit('subscribers')).toBeNull()
    expect(normalizeGoalUnit('books')).toBeNull()
    expect(normalizeGoalUnit('')).toBeNull()
    expect(normalizeGoalUnit(null)).toBeNull()
    expect(normalizeGoalUnit(undefined)).toBeNull()
  })
})

describe('unitToBackfill', () => {
  it('fills the detected unit when the goal has none stored', () => {
    expect(unitToBackfill(null, 'lb')).toBe('lb')
    expect(unitToBackfill('', 'kg')).toBe('kg')
    expect(unitToBackfill('   ', 'cm')).toBe('cm')
  })

  it('never overwrites a unit the user already set (returns null = leave it)', () => {
    expect(unitToBackfill('reps', 'lb')).toBeNull()
    expect(unitToBackfill('subscribers', 'kg')).toBeNull()
  })

  it('leaves an empty unit untouched when nothing was detected', () => {
    expect(unitToBackfill(null, null)).toBeNull()
    expect(unitToBackfill('', null)).toBeNull()
  })
})

import { guessCategory, clampCategory, CATEGORY_WORD, GOAL_CATEGORIES } from '@/lib/goals/categories'

describe('goal category fallback', () => {
  it('keyword-guesses common goals into the right bucket', () => {
    expect(guessCategory('I wanna get a 3 plate bench')).toBe('fitness')
    expect(guessCategory('hit 1000 subs on yt')).toBe('audience')
    expect(guessCategory('save up for a car')).toBe('money')
    expect(guessCategory('get better at guitar')).toBe('craft')
    expect(guessCategory('read more books this year')).toBe('mind')
    expect(guessCategory('sleep 8 hours a night')).toBe('health')
    expect(guessCategory('see my family more')).toBe('people')
    expect(guessCategory('get a promotion at work')).toBe('career')
  })

  it('falls back to general when nothing matches', () => {
    expect(guessCategory('asdfghjkl')).toBe('general')
    expect(guessCategory('')).toBe('general')
  })

  it('reads "save my marriage" as people, never money via the bare save', () => {
    expect(guessCategory('save my marriage')).toBe('people')
    expect(guessCategory('save my relationship with my kids')).toBe('people')
  })

  it('reads a money 10k as money, never fitness via the race distance', () => {
    expect(guessCategory('save 10k')).toBe('money')
    expect(guessCategory('10k mrr')).toBe('money')
    expect(guessCategory('hit 10k revenue')).toBe('money')
  })

  it('still reads a real race 5k/10k as fitness when a running word is nearby', () => {
    expect(guessCategory('run a 5k')).toBe('fitness')
    expect(guessCategory('10k run under 50 minutes')).toBe('fitness')
    expect(guessCategory('train for a 10k')).toBe('fitness')
  })

  it('reads quit-vice goals as health even with -ing forms', () => {
    expect(guessCategory('quit smoking')).toBe('health')
    expect(guessCategory('stop vaping')).toBe('health')
    expect(guessCategory('stop smoking for good')).toBe('health')
  })

  it('clamps unknown / non-string categories to general, keeps valid ones', () => {
    expect(clampCategory('fitness')).toBe('fitness')
    expect(clampCategory('FITNESS')).toBe('fitness')
    expect(clampCategory('bogus')).toBe('general')
    expect(clampCategory(null)).toBe('general')
    expect(clampCategory(42)).toBe('general')
  })

  it('every category has a display word', () => {
    for (const c of GOAL_CATEGORIES) expect(CATEGORY_WORD[c]).toBeTruthy()
  })
})

describe('goal category fallback, the 2026-07-10 break-hunt gaps, now laws', () => {
  it('flagship body-comp goals never die in General', () => {
    expect(guessCategory('lose 10 pounds')).toBe('health')
    expect(guessCategory('lose weight')).toBe('fitness') // 'weights?' fires first; still body-adjacent
    expect(guessCategory('drop 5 kg')).toBe('health')
    expect(guessCategory('bulk up clean')).toBe('health')
  })

  it('prefix stems actually match their real words (\\w* inside the boundary)', () => {
    expect(guessCategory('meditate')).toBe('health')
    expect(guessCategory('meditate every morning')).toBe('health')
    expect(guessCategory('stay hydrated')).toBe('health')
    expect(guessCategory('be more productive')).toBe('mind')
    expect(guessCategory('see my therapist weekly')).toBe('health')
  })

  it('injury and rehab words reach fitness (the gentle route depends on it)', () => {
    expect(guessCategory('rehab my knee')).toBe('fitness')
    expect(guessCategory('recover from shoulder surgery')).toBe('fitness')
    expect(guessCategory('physio twice a week')).toBe('fitness')
  })

  it('career and family words land home', () => {
    expect(guessCategory('get promoted')).toBe('career')
    expect(guessCategory('call my mom every sunday')).toBe('people')
    expect(guessCategory('be a better dad')).toBe('people')
    expect(guessCategory('visit my grandma more')).toBe('people')
  })

  it('walking goals are fitness only when they read like walking', () => {
    expect(guessCategory('walk 10k steps')).toBe('fitness')
    expect(guessCategory('10000 steps a day')).toBe('fitness')
  })
})

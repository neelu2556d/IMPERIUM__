/**
 * The gibberish guard (TRAIN 4): keyboard mash never saves as a goal, and no
 * real goal is ever insulted with a rejection. Pure function, no IO.
 */
import { isGibberish } from '@/lib/goals/gibberish'

describe('isGibberish, rejects mash', () => {
  it('rejects too-short titles (< 3 letters of meat)', () => {
    for (const t of ['', ' ', 'a', 'xy', '!!', '..', ' k ']) {
      expect(isGibberish(t)).toBe(true)
    }
  })

  it('rejects one repeated character', () => {
    for (const t of ['aaaa', 'zzzzzzz', 'a a a a a', '......', 'mmmm']) {
      expect(isGibberish(t)).toBe(true)
    }
  })

  it('rejects consonant mash (keyboard rows)', () => {
    for (const t of ['sdfghjkl', 'qwrtpsdfg', 'zxcvbnm', 'fdsfdsfd dsfsdf']) {
      expect(isGibberish(t)).toBe(true)
    }
  })

  it('rejects short repeated patterns', () => {
    for (const t of ['hahahaha', 'abababab', 'xoxoxoxo', 'lololololol']) {
      expect(isGibberish(t)).toBe(true)
    }
  })

  it('rejects a bare q mid-token (the 2026-07-10 hunt: giahrupqiuhger)', () => {
    expect(isGibberish('giahrupqiuhger')).toBe(true)
  })

  it('rejects keyboard-row runs even when they carry a vowel', () => {
    for (const t of ['asdf qwerty zzz', 'asdf', 'qwerty', 'sdfg hjkl']) {
      expect(isGibberish(t)).toBe(true)
    }
  })
})

describe('isGibberish, never blocks a real goal', () => {
  it('passes every shape of real goal a human types', () => {
    const real = [
      'run a marathon',
      'gym', // y counts as a vowel
      'save 10k',
      'sleep 8 hours every night',
      'lose 10 pounds',
      'therapy every week',
      'be a better dad',
      'read 12 books',
      'meditate',
      'quit vaping',
      'walk 10k steps',
      'In 2026 I want 1000 subscribers',
      'stop doomscrolling at night',
      'call my mom every sunday',
    ]
    for (const t of real) {
      expect(isGibberish(t)).toBe(false)
    }
  })

  it('a number-led goal passes (digits are how goals speak)', () => {
    expect(isGibberish('10000 steps')).toBe(false)
    expect(isGibberish('225 bench')).toBe(false)
  })

  it('one plausible word redeems surrounding noise', () => {
    expect(isGibberish('xxx marathon xxx')).toBe(false)
  })

  it('q-then-u words are untouched by the bare-q rule', () => {
    for (const t of ['quit vaping', 'squat 140', 'quinoa every day', 'question everything']) {
      expect(isGibberish(t)).toBe(false)
    }
  })

  it('a goal in any non-Latin script always passes (mash rules only know ASCII)', () => {
    for (const t of ['Читать 12 книг', '毎日走る', 'Похудеть на 5 кг', 'κάθε μέρα τρέξιμο', 'قراءة الكتب']) {
      expect(isGibberish(t)).toBe(false)
    }
  })
})

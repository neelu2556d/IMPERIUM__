import {
  patternKeyOf,
  onNoticeCooldown,
  selectFresh,
  NOTICED_COOLDOWN_DAYS,
  type NoticedCooldown,
} from '@/lib/insights/noticedLedger'

describe('patternKeyOf — a stable, order-independent key per cross-domain seam', () => {
  it('joins the domains with + so each pattern rests on its own clock', () => {
    expect(patternKeyOf(['caffeine', 'recovery'])).toBe('caffeine+recovery')
    expect(patternKeyOf(['sleep', 'training'])).toBe('sleep+training')
  })
  it('ignores domain order (the same seam is one pattern however it is listed)', () => {
    expect(patternKeyOf(['recovery', 'caffeine'])).toBe(patternKeyOf(['caffeine', 'recovery']))
  })
  it('lowercases and trims so casing/spacing can never split one pattern in two', () => {
    expect(patternKeyOf([' Sleep ', 'Training'])).toBe('sleep+training')
  })
  it('drops empty fragments', () => {
    expect(patternKeyOf(['caffeine', '', '  '])).toBe('caffeine')
  })
})

describe('onNoticeCooldown — a found insight rests after it is shown, so it lands like a gift', () => {
  const today = '2026-06-22'

  it('is not on cooldown when there is no ledger row', () => {
    expect(onNoticeCooldown(today, undefined)).toBe(false)
  })
  it('is not on cooldown when the row has never recorded a show', () => {
    expect(onNoticeCooldown(today, { lastShownAt: null, resolution: null })).toBe(false)
  })
  it('rests for the shown window (5 days, the launch cadence) after a plain show', () => {
    // shown 3 days ago -> still resting
    expect(onNoticeCooldown(today, { lastShownAt: '2026-06-19T08:00:00Z', resolution: null })).toBe(true)
    // shown exactly 5 days ago -> the window has elapsed, free to surface again
    expect(onNoticeCooldown(today, { lastShownAt: '2026-06-17T08:00:00Z', resolution: null })).toBe(false)
    // shown long ago -> free
    expect(onNoticeCooldown(today, { lastShownAt: '2026-05-01T08:00:00Z', resolution: null })).toBe(false)
  })
  it('rests longer once the user has resolved it (dismissed / talked it through)', () => {
    // dismissed 20 days ago: still inside the 30-day resolved window
    expect(onNoticeCooldown(today, { lastShownAt: '2026-06-02T08:00:00Z', resolution: 'dismissed' })).toBe(true)
    // and the resolved window is longer than the plain shown window
    expect(NOTICED_COOLDOWN_DAYS.dismissed).toBeGreaterThan(NOTICED_COOLDOWN_DAYS.shown)
    expect(NOTICED_COOLDOWN_DAYS.talk).toBeGreaterThan(NOTICED_COOLDOWN_DAYS.shown)
  })
})

describe('selectFresh — keep only the seams not currently resting, before the engine picks one', () => {
  const today = '2026-06-22'
  const seam = (domains: string[]) => ({ score: { domains } })

  it('keeps a seam with no ledger entry', () => {
    const out = selectFresh([seam(['caffeine', 'recovery'])], {}, today)
    expect(out).toHaveLength(1)
  })
  it('drops a seam still resting, but keeps a fresh one (so Vee can still surface something)', () => {
    const cooldown: Record<string, NoticedCooldown> = {
      'sleep+training': { lastShownAt: '2026-06-20T08:00:00Z', resolution: null }, // 2 days ago, resting
    }
    const out = selectFresh(
      [seam(['sleep', 'training']), seam(['caffeine', 'recovery'])],
      cooldown,
      today,
    )
    expect(out).toHaveLength(1)
    expect(out[0].score.domains).toEqual(['caffeine', 'recovery'])
  })
  it('matches the ledger regardless of how the seam lists its domains', () => {
    const cooldown: Record<string, NoticedCooldown> = {
      'caffeine+recovery': { lastShownAt: '2026-06-21T08:00:00Z', resolution: null },
    }
    // seam lists them reversed; still recognised as the resting pattern
    const out = selectFresh([seam(['recovery', 'caffeine'])], cooldown, today)
    expect(out).toHaveLength(0)
  })
  it('skips null / undefined candidates', () => {
    const out = selectFresh([null, undefined, seam(['caffeine', 'recovery'])], {}, today)
    expect(out).toHaveLength(1)
  })
})

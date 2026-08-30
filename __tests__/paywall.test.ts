import { readPaywallConfig, appAccessAllowed } from '@/lib/auth/paywall'

// Whole-app paywall gate (free signup, pay to use). The safety-critical property:
// when the flag is OFF, EVERYONE is allowed (so a deploy can't lock anyone out);
// when ON, only Pro or comped emails get in.

describe('readPaywallConfig', () => {
  test('off by default; comp list empty', () => {
    expect(readPaywallConfig({})).toEqual({ enabled: false, compEmails: [] })
  })
  test('enabled only on the exact string "true"', () => {
    expect(readPaywallConfig({ PAYWALL_ENABLED: 'true' }).enabled).toBe(true)
    expect(readPaywallConfig({ PAYWALL_ENABLED: '1' }).enabled).toBe(false)
    expect(readPaywallConfig({ PAYWALL_ENABLED: 'TRUE' }).enabled).toBe(false)
  })
  test('comp emails are split, trimmed, lowercased, de-blanked', () => {
    expect(readPaywallConfig({ PAYWALL_COMP_EMAILS: ' A@x.com , b@Y.com ,, ' }).compEmails).toEqual(['a@x.com', 'b@y.com'])
  })
})

describe('appAccessAllowed', () => {
  const on = { enabled: true, compEmails: ['alex@x.com'] }
  const off = { enabled: false, compEmails: [] }

  test('flag OFF → everyone allowed (free included) — deploy-safe', () => {
    expect(appAccessAllowed({ config: off, tier: 'free', email: 'nobody@x.com' })).toBe(true)
    expect(appAccessAllowed({ config: off, tier: null, email: null })).toBe(true)
  })

  test('flag ON → Pro allowed', () => {
    expect(appAccessAllowed({ config: on, tier: 'pro', email: 'anyone@x.com' })).toBe(true)
  })

  test('flag ON → free / plus / null blocked unless comped', () => {
    expect(appAccessAllowed({ config: on, tier: 'free', email: 'nobody@x.com' })).toBe(false)
    expect(appAccessAllowed({ config: on, tier: 'plus', email: 'nobody@x.com' })).toBe(false)
    expect(appAccessAllowed({ config: on, tier: null, email: null })).toBe(false)
  })

  test('flag ON → comped email allowed regardless of tier (case-insensitive)', () => {
    expect(appAccessAllowed({ config: on, tier: 'free', email: 'ALEX@x.com' })).toBe(true)
    expect(appAccessAllowed({ config: on, tier: 'free', email: 'alex@x.com' })).toBe(true)
  })
})

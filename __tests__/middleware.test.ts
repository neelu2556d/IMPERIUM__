import { NextRequest } from 'next/server'

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { updateSession } from '@/lib/supabase/middleware'

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`)
}

function mockSupabase(user: { id: string } | null, onboarded: boolean | 'error' = true) {
  ;(createServerClient as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(
        onboarded === 'error'
          ? { data: null, error: { message: 'no rows', code: 'PGRST116' } }
          : { data: user ? { onboarded } : null, error: null }
      ),
    }),
  })
}

describe('updateSession', () => {
  beforeEach(() => jest.clearAllMocks())

  // ── Unauthenticated ──────────────────────────────────────────
  it('redirects unauthenticated user from /app to /login', async () => {
    mockSupabase(null)
    const res = await updateSession(makeRequest('/app'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects unauthenticated user from /account to /login', async () => {
    mockSupabase(null)
    const res = await updateSession(makeRequest('/account'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects unauthenticated user from /app/logger to /login', async () => {
    mockSupabase(null)
    const res = await updateSession(makeRequest('/app/logger'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects unauthenticated user from /onboarding to /login', async () => {
    mockSupabase(null)
    const res = await updateSession(makeRequest('/onboarding'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows unauthenticated user to access /', async () => {
    mockSupabase(null)
    const res = await updateSession(makeRequest('/'))
    expect(res.status).toBe(200)
  })

  // ── Authenticated + onboarded ────────────────────────────────
  it('redirects authenticated onboarded user from /login to /app', async () => {
    mockSupabase({ id: 'uid' }, true)
    const res = await updateSession(makeRequest('/login'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/app')
  })

  it('redirects authenticated onboarded user from /signup to /app', async () => {
    mockSupabase({ id: 'uid' }, true)
    const res = await updateSession(makeRequest('/signup'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/app')
  })

  it('allows authenticated onboarded user to access /app', async () => {
    mockSupabase({ id: 'uid' }, true)
    const res = await updateSession(makeRequest('/app'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated onboarded user from /onboarding to /app', async () => {
    mockSupabase({ id: 'uid' }, true)
    const res = await updateSession(makeRequest('/onboarding'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/app')
  })

  // ── Authenticated + not onboarded (the bug) ──────────────────
  it('redirects authenticated non-onboarded user from /app to /onboarding', async () => {
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/app'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('redirects authenticated non-onboarded user from /account to /onboarding', async () => {
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/account'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('redirects authenticated non-onboarded user from /login to /onboarding', async () => {
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/login'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('redirects authenticated non-onboarded user from /signup to /onboarding', async () => {
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/signup'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('allows authenticated non-onboarded user to access /onboarding', async () => {
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/onboarding'))
    expect(res.status).toBe(200)
  })

  // ── Profile query failure ─────────────────────────────────────
  // PATCH06: when the profile query fails on a protected route, the safe default
  // is /onboarding — NOT a pass-through to /app. Non-onboarded users in /app is
  // a bug; onboarded users landing on /onboarding are immediately bounced back.
  it('redirects to /onboarding when profile query fails on protected route (never pass through to /app)', async () => {
    mockSupabase({ id: 'uid' }, 'error')
    const res = await updateSession(makeRequest('/app'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('still passes through when profile query fails on /onboarding (already safe)', async () => {
    mockSupabase({ id: 'uid' }, 'error')
    const res = await updateSession(makeRequest('/onboarding'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  // ── PATCH06 regression: profiles.onboarded=false, no user_profile row ─────
  it('user with profiles.onboarded=false is blocked from /app and redirected to /onboarding', async () => {
    // Simulates the exact PATCH06 repro: profiles row exists with onboarded=false,
    // user_profile row does not exist (never completed step 4).
    // The middleware must not pass through to /app.
    mockSupabase({ id: 'uid' }, false)
    const res = await updateSession(makeRequest('/app'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })
})

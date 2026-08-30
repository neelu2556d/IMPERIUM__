jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { saveOnboardingProfile, completeOnboarding } from '@/app/onboarding/actions'

const TEST_USER = { id: 'user-abc-123' }

const sampleProfile = {
  firstName: 'Alex',
  birthday: '2005-01-01',
  sex: 'M' as const,
  heightCm: 180.5,
  startingWeightKg: 82.3,
  units: 'metric' as const,
  focusAreas: ['body', 'mind'] as ('body' | 'mind' | 'peak' | 'brand' | 'money')[],
}

function mockClient({
  user = TEST_USER,
  upsertError = null,
  updateError = null,
}: {
  user?: { id: string } | null
  upsertError?: { message: string } | null
  updateError?: { message: string } | null
} = {}) {
  const mockUpsert = jest.fn().mockResolvedValue({ error: upsertError })

  const mockEqChain = { eq: jest.fn().mockReturnThis() }
  const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: updateError }) })

  // completeOnboarding does a defense-in-depth read of user_profile to verify
  // all required fields are present before flipping `onboarded`. Mock the
  // .select(...).eq(...).maybeSingle() chain to return a complete profile so
  // the gate passes. Tests that want to assert "incomplete profile bounces
  // back to /onboarding" can override this with a different mockClient option.
  const completeProfileRow = {
    first_name: 'Alex',
    birthday: '2005-01-01',
    sex: 'M',
    height_cm: 180.5,
    starting_weight_kg: 82.3,
    units: 'metric',
    focus_areas: ['body', 'mind'],
  }
  const mockMaybeSingle = jest.fn().mockResolvedValue({ data: completeProfileRow, error: null })
  const mockSelectEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
  const mockSelect = jest.fn().mockReturnValue({ eq: mockSelectEq })

  const mockFrom = jest.fn((table: string) => {
    if (table === 'user_profile') return { upsert: mockUpsert, update: mockUpdate, select: mockSelect }
    if (table === 'profiles') return { update: mockUpdate }
    return mockEqChain
  })

  ;(createClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from: mockFrom,
  })

  return { mockUpsert, mockUpdate, mockFrom }
}

// PATCH04 regression: "permission denied for table user_profile" was caused by
// missing GRANT statements in the BUILD02 SQL migration (not an app-layer bug).
// The application layer was correct: authed client, user_id from getUser(), anon key.
// These tests verify that layer stays correct.
describe('authed user completing onboarding', () => {
  beforeEach(() => jest.clearAllMocks())

  it('writes user_profile row with the authenticated user id', async () => {
    const { mockUpsert } = mockClient({ user: { id: 'real-user-uuid' } })
    const result = await saveOnboardingProfile(sampleProfile)

    expect(result).toBeNull()
    // user_id in the upsert payload must match the authed user, not a hardcoded value
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'real-user-uuid' })
    )
  })

  it('does not write user_profile when session is missing (returns error, not crash)', async () => {
    const { mockUpsert } = mockClient({ user: null })
    const result = await saveOnboardingProfile(sampleProfile)

    expect(result).toBe('Not authenticated')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('surfaces DB errors to the caller (e.g. permission denied for table user_profile)', async () => {
    mockClient({ upsertError: { message: 'permission denied for table user_profile' } })
    const result = await saveOnboardingProfile(sampleProfile)
    expect(result).toBe('permission denied for table user_profile')
  })
})

describe('saveOnboardingProfile', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null (success) and calls upsert with correct fields', async () => {
    const { mockUpsert } = mockClient()
    const result = await saveOnboardingProfile(sampleProfile)

    expect(result).toBeNull()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: TEST_USER.id,
        first_name: 'Alex',
        birthday: '2005-01-01',
        sex: 'M',
        height_cm: 180.5,
        starting_weight_kg: 82.3,
        units: 'metric',
        focus_areas: ['body', 'mind'],
        onboarding_step: 4,
      })
    )
  })

  it('returns null when focus_areas has a single pick', async () => {
    mockClient()
    const result = await saveOnboardingProfile({ ...sampleProfile, focusAreas: ['money'] })
    expect(result).toBeNull()
  })

  it('returns error message when upsert fails', async () => {
    mockClient({ upsertError: { message: 'RLS violation' } })
    const result = await saveOnboardingProfile(sampleProfile)
    expect(result).toBe('RLS violation')
  })

  it('returns "Not authenticated" when no user session', async () => {
    mockClient({ user: null })
    const result = await saveOnboardingProfile(sampleProfile)
    expect(result).toBe('Not authenticated')
  })

  it('stores onboarding_step as 4', async () => {
    const { mockUpsert } = mockClient()
    await saveOnboardingProfile(sampleProfile)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_step: 4 })
    )
  })

  it('trims whitespace from first_name', async () => {
    const { mockUpsert } = mockClient()
    await saveOnboardingProfile({ ...sampleProfile, firstName: '  Alex  ' })
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Alex' })
    )
  })
})

describe('completeOnboarding', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects to /welcome on completion', async () => {
    mockClient()
    await completeOnboarding()
    expect(redirect).toHaveBeenCalledWith('/welcome')
  })

  it('redirects to /login when no user session', async () => {
    mockClient({ user: null })
    await completeOnboarding()
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('updates both profiles.onboarded and user_profile.onboarding_step', async () => {
    const { mockFrom } = mockClient()
    await completeOnboarding()

    // profiles table should be updated with onboarded: true
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    // user_profile table should be updated with onboarding_step: 5
    expect(mockFrom).toHaveBeenCalledWith('user_profile')
  })
})

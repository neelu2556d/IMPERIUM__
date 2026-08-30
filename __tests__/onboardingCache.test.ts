import { loadOnboardingCache, saveOnboardingCache, clearOnboardingCache } from '@/lib/vitality/onboardingCache'

// localStorage doesn't exist in Node — provide a minimal in-memory mock
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: jest.fn((key: string) => store[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { store[key] = value }),
  removeItem: jest.fn((key: string) => { delete store[key] }),
  clear: jest.fn(() => { for (const k in store) delete store[k] }),
  length: 0,
  key: jest.fn(),
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

const USER_A = 'user-aaa-111'
const USER_B = 'user-bbb-222'

const sampleState = {
  step: 2,
  firstName: 'Alice',
  birthday: '1990-01-01',
  sex: 'F',
  heightCm: '165',
  heightFt: '',
  heightIn: '0',
  startingWeightKg: '60',
  startingWeightLbs: '',
  units: 'metric',
  goal: '',
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorageMock.clear()
})

describe('loadOnboardingCache — cross-user isolation', () => {
  it('returns null when cache is empty', () => {
    expect(loadOnboardingCache(USER_A)).toBeNull()
  })

  it('returns cached state when userId matches', () => {
    saveOnboardingCache(USER_A, sampleState)
    const result = loadOnboardingCache(USER_A)
    expect(result).not.toBeNull()
    expect(result?.firstName).toBe('Alice')
    expect(result?.step).toBe(2)
  })

  it('returns null and clears cache when userId does not match — PATCH05 regression', () => {
    // User A partially completes onboarding and closes tab
    saveOnboardingCache(USER_A, sampleState)

    // User B signs up in the same browser session
    const result = loadOnboardingCache(USER_B)

    expect(result).toBeNull()
    // Cache must be cleared so User B doesn't see User A's data on subsequent calls
    expect(localStorageMock.removeItem).toHaveBeenCalled()
    expect(loadOnboardingCache(USER_B)).toBeNull()
  })

  it('user B sees empty form after user A left data in cache', () => {
    // Simulate User A reaching step 3 and closing tab
    saveOnboardingCache(USER_A, { ...sampleState, step: 3 })
    expect(loadOnboardingCache(USER_A)?.step).toBe(3)

    // User B signs up — form should start fresh with no pre-fill
    const userBCache = loadOnboardingCache(USER_B)
    expect(userBCache).toBeNull()
  })

  it('user B can save and load their own data correctly', () => {
    saveOnboardingCache(USER_B, { ...sampleState, firstName: 'Bob', step: 1 })
    const result = loadOnboardingCache(USER_B)
    expect(result?.firstName).toBe('Bob')
    expect(result?.step).toBe(1)
  })
})

describe('saveOnboardingCache', () => {
  it('stores userId alongside form state', () => {
    saveOnboardingCache(USER_A, sampleState)
    const raw = JSON.parse(localStorageMock.getItem('vitality_onboarding_v1') as string)
    expect(raw.userId).toBe(USER_A)
  })

  it('overwrites previous save for same user', () => {
    saveOnboardingCache(USER_A, { ...sampleState, step: 1 })
    saveOnboardingCache(USER_A, { ...sampleState, step: 3 })
    expect(loadOnboardingCache(USER_A)?.step).toBe(3)
  })
})

describe('clearOnboardingCache', () => {
  it('removes cached state', () => {
    saveOnboardingCache(USER_A, sampleState)
    clearOnboardingCache()
    expect(loadOnboardingCache(USER_A)).toBeNull()
  })

  it('is a no-op when cache is already empty', () => {
    expect(() => clearOnboardingCache()).not.toThrow()
  })
})

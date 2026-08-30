import { categorizeGoal } from '@/lib/goals/categorize'

// No API key -> categorizeGoal takes its deterministic offline fallback (no
// network). That path must still attach the goal's own unit, so the unit is
// captured even when the AI tidy step is unavailable.
describe('categorizeGoal — attaches the goal unit (offline fallback)', () => {
  const orig = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { delete process.env.ANTHROPIC_API_KEY })
  afterAll(() => { if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig })

  it('detects the unit stated in the raw title', async () => {
    expect((await categorizeGoal('bench 225 lbs')).unit).toBe('lb')
    expect((await categorizeGoal('squat 140kg')).unit).toBe('kg')
  })

  it('returns a null unit when the goal states none', async () => {
    expect((await categorizeGoal('reach 1000 subscribers')).unit).toBeNull()
    expect((await categorizeGoal('get a bigger bench')).unit).toBeNull()
  })
})

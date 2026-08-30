import { buildStarter } from '@/lib/oracle/coldStart'

describe('buildStarter', () => {
  it('invites a brand-new user with no goal to set one (no fake finding)', () => {
    const s = buildStarter({ topGoalTitle: null, activeGoalCount: 0, loggedDomains: [] })
    expect(s.kind).toBe('noGoal')
    expect(s.goalTitle).toBeNull()
    expect(s.headline.length).toBeGreaterThan(0)
    expect(s.body.length).toBeGreaterThan(0)
    expect(s.watching.length).toBeGreaterThan(0)
  })

  it('promises to watch a real goal when one is set but nothing has converged yet', () => {
    const s = buildStarter({
      topGoalTitle: 'get lean',
      activeGoalCount: 1,
      loggedDomains: ['training', 'weight'],
    })
    expect(s.kind).toBe('watching')
    expect(s.goalTitle).toBe('get lean')
    expect(s.headline.toLowerCase()).toContain('get lean')
    expect(s.watching).toContain('training')
  })

  it('degrades gracefully when a goal exists but its title is missing', () => {
    const s = buildStarter({ topGoalTitle: null, activeGoalCount: 2, loggedDomains: [] })
    expect(s.kind).toBe('watching')
    expect(s.headline.length).toBeGreaterThan(0)
    expect(s.watching.length).toBeGreaterThan(0)
  })
})

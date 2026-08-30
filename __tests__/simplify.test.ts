import { simplifyLead } from '@/lib/insights/simplify'

// the real caffeine -> recovery lead (peakSeams.caffeineRecoverySeam)
const CAFFEINE =
  'Your recovery runs lower the mornings after your heavier caffeine days. After your higher-caffeine days (about 340 mg) your next-morning recovery averaged 58%, after your lighter ones (about 150 mg) it was 71%. Ease off the late, heavy hits and your mornings bounce back.'
// the real sleep <-> training lead (fusion.sleepWorkoutSeam)
const SLEEP =
  'You train more in the weeks you sleep more. Your better-sleep weeks (7.5 h a night) averaged 4 sessions, your short ones (5.5 h) only 2. Protect your sleep and the gym follows.'

describe('simplifyLead — the scan-in-a-second read (strip the numbers, keep the meaning)', () => {
  it('drops the number-heavy sentence but keeps the hook and the move', () => {
    const out = simplifyLead(CAFFEINE)
    expect(out).toContain('Your recovery runs lower the mornings after your heavier caffeine days.')
    expect(out).toContain('Ease off the late, heavy hits')
    expect(out).not.toMatch(/\d/)        // no digits survive
    expect(out).not.toContain('mg')
    expect(out).not.toContain('%')
    expect(out).not.toContain('(')       // parentheticals gone too
  })

  it('keeps the highlighted key phrase intact (so the card highlight still lands)', () => {
    const key = 'lower the mornings after your heavier caffeine days'
    expect(simplifyLead(CAFFEINE)).toContain(key)
  })

  it('works for any seam, not just caffeine (sleep <-> training)', () => {
    const out = simplifyLead(SLEEP)
    expect(out).toContain('You train more in the weeks you sleep more.')
    expect(out).toContain('Protect your sleep and the gym follows.')
    expect(out).not.toMatch(/\d/)
  })

  it('is a no-op (besides whitespace) when there is nothing numeric to strip', () => {
    const plain = 'You show up. Keep showing up.'
    expect(simplifyLead(plain)).toBe('You show up. Keep showing up.')
  })

  it('never returns empty: falls back to the first sentence if every sentence has a number', () => {
    const allNums = '3 sessions this week. 4 sessions last week.'
    const out = simplifyLead(allNums)
    expect(out.length).toBeGreaterThan(0)
  })

  it('collapses the seams it leaves behind into single spaces (no double gaps)', () => {
    expect(simplifyLead(CAFFEINE)).not.toMatch(/ {2,}/)
  })
})

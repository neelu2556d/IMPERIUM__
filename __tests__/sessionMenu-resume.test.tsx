/**
 * @jest-environment jsdom
 *
 * Regression: a day you logged on a PAST date but never tapped Finish shows
 * "Not finished - tap to finish it". Tapping it must reopen THAT day's session
 * (so you can add forgotten cardio + finish it), not a blank today-session.
 *
 * The board signals this by linking the unfinished card to the day with a
 * ?resume=<that row's date> param; the [day] route loads that date instead of
 * today. Without the param the card dead-ended into an empty today session
 * ("0 of 25 logged") even though the work was saved — reported by Alex
 * (2026-06-21): "nothing is logged but the history is in there ... did it
 * never get pushed?".
 */
import { render, screen } from '@testing-library/react'
import SessionMenu from '@/app/app/fitness/log/SessionMenu'
import type { SplitDay } from '@/app/app/fitness/log/splitData'
import type { DayStatus } from '@/lib/workouts/queries'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => '/app/fitness/log',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
jest.mock('../app/app/fitness/log/SettingsSheet', () => ({ __esModule: true, default: () => null }))
jest.mock('../app/app/fitness/log/actions', () => ({
  setUnits: jest.fn(),
  startDeload: jest.fn(),
  endDeload: jest.fn(),
  startNewWeek: jest.fn(),
  revertNewWeek: jest.fn(),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn(() => ({})) }))

const TODAY = '2026-06-21'
const YESTERDAY = '2026-06-20'
const split: SplitDay[] = [
  { day: 2, name: 'Pull', type: 'HEAVY', category: 'pull',
    exercises: [{ id: 'pullup', sets: 3, reps: 8 }] },
]

describe('SessionMenu — resuming an unfinished past day', () => {
  it('links a "Not finished" past day to that day with ?resume=<its date>', () => {
    const dayStatuses: Record<string, DayStatus> = {
      Pull: {
        workoutId: 'w-pull-1', dayName: 'Pull', date: YESTERDAY,
        submittedAt: null, setCount: 25, exercises: [],
      },
    }
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={dayStatuses} />)

    expect(screen.getByText(/Not finished/i)).toBeInTheDocument()
    expect(screen.getByText('Pull').closest('a')).toHaveAttribute(
      'href',
      `/app/fitness/log/2?resume=${YESTERDAY}`,
    )
  })

  it('shows the live progress + finish cue (not the plain "Not finished" line) for a logged past day', () => {
    const dayStatuses: Record<string, DayStatus> = {
      Pull: {
        workoutId: 'w-pull-1', dayName: 'Pull', date: YESTERDAY, submittedAt: null,
        setCount: 2,
        exercises: [{
          id: 'pullup', name: 'Weighted pull-ups', targetSets: 3, targetReps: 6,
          sets: [
            { weight: 7.5, reps: 6, done: true, failed: false },
            { weight: 7.5, reps: 6, done: true, failed: false },
            { weight: null, reps: null, done: false, failed: false },
          ],
        }],
      },
    }
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={dayStatuses} />)

    // Live in-progress cue (flashing-dot card), not the plain amber "Not finished".
    expect(screen.getByText(/tap to finish it/)).toBeInTheDocument()
    expect(screen.queryByText(/Not finished/)).not.toBeInTheDocument()
    // Still resumes that day's session.
    expect(screen.getByText('Pull').closest('a')).toHaveAttribute(
      'href', `/app/fitness/log/2?resume=${YESTERDAY}`,
    )
  })

  it('links a normal (planned) day with no resume param', () => {
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={{}} />)
    expect(screen.getByText('Pull').closest('a')).toHaveAttribute('href', '/app/fitness/log/2')
  })
})

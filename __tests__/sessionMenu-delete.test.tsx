/**
 * @jest-environment jsdom
 *
 * Regression: deleting a completed day from the board must
 *   (1) drop the tile IMMEDIATELY (optimistic) — not only after the network
 *       round-trip — so a slow connection never looks frozen, and
 *   (2) call router.refresh() so Next.js 14's client Router Cache is
 *       invalidated; otherwise the day still reads "logged" after you navigate
 *       away and back (the cached RSC payload is served).
 *
 * Reported by Alex at the gym (2026-06-21): deleting a demo day "took 2 minutes
 * ... didn't work and then it did", and the day "still said logged" after
 * backing out to the dashboard and returning.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SessionMenu from '@/app/app/fitness/log/SessionMenu'
import type { SplitDay } from '@/app/app/fitness/log/splitData'
import type { DayStatus } from '@/lib/workouts/queries'
import { deleteWorkout } from '@/lib/workouts/queries'

const refreshMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: refreshMock,
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
jest.mock('@/lib/workouts/queries', () => ({
  ...jest.requireActual('@/lib/workouts/queries'),
  deleteWorkout: jest.fn(),
}))

const TODAY = '2026-06-21'
const split: SplitDay[] = [
  { day: 1, name: 'Pull', type: 'HEAVY', category: 'pull',
    exercises: [{ id: 'pullup', sets: 3, reps: 8 }] },
]

function completedPull(): Record<string, DayStatus> {
  return {
    Pull: {
      workoutId: 'w-pull-1',
      dayName: 'Pull',
      date: TODAY,
      submittedAt: `${TODAY}T10:00:00Z`,
      setCount: 6,
      exercises: [],
    },
  }
}

// "..." overflow -> Delete menu item -> arms the confirm sheet.
function armDeleteConfirm() {
  fireEvent.click(screen.getByLabelText('Pull options'))
  fireEvent.click(screen.getByText('Delete'))
}

describe('SessionMenu — deleting a completed day', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    ;(deleteWorkout as jest.Mock).mockReset()
  })

  it('drops the tile immediately, before the network call resolves (optimistic)', () => {
    // deleteWorkout hangs forever: proves the UI does NOT wait on it.
    ;(deleteWorkout as jest.Mock).mockReturnValue(new Promise(() => {}))
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={completedPull()} />)
    // The "done" tile is on screen to start.
    expect(screen.getByText('in the books')).toBeInTheDocument()

    armDeleteConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    // Tile reverted to its planned/openable state synchronously — the "done"
    // claim is gone even though the delete promise never resolved.
    expect(screen.queryByText('in the books')).not.toBeInTheDocument()
  })

  it('calls router.refresh() after a successful delete (busts the Router Cache)', async () => {
    ;(deleteWorkout as jest.Mock).mockResolvedValue(undefined)
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={completedPull()} />)

    armDeleteConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(deleteWorkout).toHaveBeenCalledWith(
      expect.anything(),
      { workoutId: 'w-pull-1', userId: 'u1' },
    )
  })

  it('restores the tile and does NOT refresh if the delete fails', async () => {
    ;(deleteWorkout as jest.Mock).mockRejectedValue(new Error('network'))
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<SessionMenu split={split} userId="u1" todayKey={TODAY} dayStatuses={completedPull()} />)

    armDeleteConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    // It came back (optimistic revert) and the cache was never invalidated.
    await waitFor(() => expect(screen.getByText('in the books')).toBeInTheDocument())
    expect(refreshMock).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

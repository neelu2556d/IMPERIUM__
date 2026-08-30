/**
 * @jest-environment jsdom
 *
 * Regression: the session-menu card and the logger must title a day from the
 * SAME field. The logger (SplitLog) uses `day.name`. The menu used to label
 * cards by `day.category` ("Push"), so a rotation named "Full body A" (tagged
 * category "push" only for its art/glyph) showed "Push" on the card but
 * "Full body A" once opened — "I picked Push and landed in Full body A".
 *
 * The card the user taps must say exactly what the logger will show.
 */
import { render, screen } from '@testing-library/react'
import SessionMenu from '@/app/app/fitness/log/SessionMenu'
import type { SplitDay } from '@/app/app/fitness/log/splitData'

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
jest.mock('../app/app/fitness/log/actions', () => ({ setUnits: jest.fn() }))

// A rotation whose day NAMES intentionally diverge from their category labels,
// exactly like a "Full body A/B/C" program tagged push/legs/pull for the art.
const split: SplitDay[] = [
  { day: 1, name: 'Full body A', type: 'HEAVY', category: 'push',
    exercises: [{ id: 'back_squat', sets: 3, reps: 5 }, { id: 'bench_bb', sets: 3, reps: 5 }] },
  { day: 2, name: 'Full body B', type: 'VOLUME', category: 'legs',
    exercises: [{ id: 'rdl', sets: 3, reps: 8 }] },
]

describe('SessionMenu day labelling', () => {
  it('titles each card by the day name, not its category', () => {
    render(<SessionMenu split={split} />)
    // The real names the logger will show must be on the cards.
    expect(screen.getByText('Full body A')).toBeInTheDocument()
    expect(screen.getByText('Full body B')).toBeInTheDocument()
    // The category labels must NOT stand in for the day title.
    expect(screen.queryByText('Push')).not.toBeInTheDocument()
    expect(screen.queryByText('Legs')).not.toBeInTheDocument()
  })

  it('links the named card to that day in the logger', () => {
    render(<SessionMenu split={split} />)
    expect(screen.getByText('Full body A').closest('a')).toHaveAttribute('href', '/app/fitness/log/1')
    expect(screen.getByText('Full body B').closest('a')).toHaveAttribute('href', '/app/fitness/log/2')
  })
})

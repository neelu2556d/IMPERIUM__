/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import Dashboard from '@/app/app/Dashboard'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

jest.mock('../app/app/fitness/log/SettingsSheet', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../app/app/fitness/log/actions', () => ({
  setUnits: jest.fn(),
}))

// DashboardCrystals mounts a Three.js renderer that jsdom can't satisfy.
// Stub it for the smoke test.
jest.mock('../components/DashboardCrystals', () => ({
  __esModule: true,
  default: () => null,
}))

// DashboardGrid runs an RAF animation loop + localStorage tile host that jsdom
// can't satisfy. Stub it with a static shell so the Dashboard smoke tests can
// render without throwing, while still exposing the tile labels they assert on.
jest.mock('../app/app/DashboardGrid', () => ({
  __esModule: true,
  default: () => (
    <div>
      <a href="/app/fitness/log">Train</a>
      <a href="/app/fuel">Fuel</a>
      <a href="/app/vitals">Vitals</a>
      <a href="/app/mentor">Vee</a>
      <a href="/app/peak">Peak</a>
      <a href="/app/brand">Brand</a>
      <a href="/app/finance">Finance</a>
    </div>
  ),
}))

const mockProps = {
  firstName: 'Alex',
  units: 'metric' as const,
  tasks: [],
  userId: 'test-user-id',
  score: 87,
  scoreState: 'scored' as const,
  tileStats: { trainDay: 'Push A', fuelKcalToday: 1840 },
}

describe('Dashboard (fused customizable grid)', () => {
  it('renders the core tile labels', () => {
    render(<Dashboard {...mockProps} />)
    expect(screen.getByText('Train')).toBeInTheDocument()
    expect(screen.getByText('Fuel')).toBeInTheDocument()
    expect(screen.getByText('Vitals')).toBeInTheDocument()
    expect(screen.getByText('Peak')).toBeInTheDocument()
    expect(screen.getByText('Brand')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
  })

  it('each tile links to its module route', () => {
    render(<Dashboard {...mockProps} />)
    const expectedHrefs: Record<string, string> = {
      Train: '/app/fitness/log',
      Fuel: '/app/fuel',
      Vitals: '/app/vitals',
      Peak: '/app/peak',
      Brand: '/app/brand',
      Finance: '/app/finance',
    }
    for (const [label, href] of Object.entries(expectedHrefs)) {
      const tile = screen.getByText(label).closest('a')
      expect(tile).not.toBeNull()
      expect(tile).toHaveAttribute('href', href)
    }
  })

  it('renders the greeting with the user first name', () => {
    render(<Dashboard {...mockProps} />)
    expect(screen.getByText(/Alex/)).toBeInTheDocument()
  })
})

/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '@/app/(auth)/login/page'

const mockPush = jest.fn()
const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const mockSignInWithPassword = jest.fn()
const mockSignInWithOAuth = jest.fn()

jest.mock('../lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects to /app (not /onboarding) after successful sign-in', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test2@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app')
    })
    expect(mockPush).not.toHaveBeenCalledWith('/onboarding')
  })

  it('shows error and does not redirect on failed sign-in', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'bad@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})

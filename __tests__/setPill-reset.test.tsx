/**
 * @jest-environment jsdom
 *
 * A logged set must only be reset via the ↺ button — tapping the status label
 * ("done"/"missed") must NOT un-log it. Tapping the label used to call onUndo,
 * which made it trivially easy to fat-finger a log away.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import SetPill from '@/app/app/fitness/log/SetPill'

const base = {
  idx: 0,
  prescribedWeight: 60,
  prescribedReps: 6,
  currentWeight: 60,
  currentReps: 6,
  isPR: false,
  units: 'metric' as const,
  onLog: jest.fn(),
  onMiss: jest.fn(),
  onUndo: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

describe('SetPill reset behaviour', () => {
  it('does NOT undo when the logged status label is tapped', () => {
    render(<SetPill {...base} kind="clean" />)
    const status = screen.getByText('done')
    expect(status.closest('button')).toBeNull() // it's a status, not a button
    fireEvent.click(status)
    expect(base.onUndo).not.toHaveBeenCalled()
  })

  it('undoes only via the ↺ reset button', () => {
    render(<SetPill {...base} kind="clean" />)
    fireEvent.click(screen.getByLabelText('Reset set 1'))
    expect(base.onUndo).toHaveBeenCalledTimes(1)
  })

  it('still logs from the empty-state action', () => {
    render(<SetPill {...base} kind="empty" currentWeight={null} currentReps={null} />)
    fireEvent.click(screen.getByText('hit it →'))
    expect(base.onLog).toHaveBeenCalledWith(60, 6)
    expect(base.onUndo).not.toHaveBeenCalled()
  })
})

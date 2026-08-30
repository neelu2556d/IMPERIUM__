/**
 * @jest-environment jsdom
 *
 * ConquerStar is the lift-conquered celebration overlay. Contract:
 *   - token 0 renders nothing (no celebration on mount / before any conquer),
 *   - bumping the token fires a celebration (a star + "Conquered").
 * Replaces the old edge-clipping gold ring that fired off the overload pill.
 */
import { render, screen } from '@testing-library/react'
import ConquerStar from '@/app/app/fitness/log/ConquerStar'

describe('ConquerStar', () => {
  it('renders nothing until the token fires', () => {
    const { container } = render(<ConquerStar token={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('plays a star celebration when the token is bumped', () => {
    render(<ConquerStar token={1} />)
    expect(screen.getByText('Conquered')).toBeInTheDocument()
    // a crisp star shape renders (at least one SVG path)
    expect(document.querySelector('svg path')).toBeTruthy()
  })
})

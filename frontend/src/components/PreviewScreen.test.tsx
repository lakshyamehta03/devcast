import { render, screen } from '@testing-library/react'
import { PreviewScreen } from './PreviewScreen'

// ---------------------------------------------------------------------------
// Cycle 6 — preview screen renders the episode title
// ---------------------------------------------------------------------------

it('renders the episode title', () => {
  render(<PreviewScreen title="How React Server Components Work" scriptBody="" />)
  expect(screen.getByRole('heading', { name: /How React Server Components Work/i })).toBeInTheDocument()
})


// ---------------------------------------------------------------------------
// Cycle 7 — accumulated script body is rendered
// ---------------------------------------------------------------------------

it('renders the accumulated script body', () => {
  const body = 'Alex: Welcome to DevCast.\nJordan: Thanks for having me.'
  render(<PreviewScreen title="Episode" scriptBody={body} />)
  expect(screen.getByText(/Alex: Welcome to DevCast/)).toBeInTheDocument()
  expect(screen.getByText(/Jordan: Thanks for having me/)).toBeInTheDocument()
})

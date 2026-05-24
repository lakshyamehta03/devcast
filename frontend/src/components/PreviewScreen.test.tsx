import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewScreen } from './PreviewScreen'

const defaultProps = {
  title: null,
  description: null,
  scriptBody: '',
  isDone: false,
  isFetchingMeta: false,
  onApprove: vi.fn(),
  onRegenerate: vi.fn(),
  onBack: vi.fn(),
  error: null,
  onRetry: vi.fn(),
}

// ---------------------------------------------------------------------------
// Cycle 6 — preview screen renders the episode title
// ---------------------------------------------------------------------------

it('renders the episode title', () => {
  render(
    <PreviewScreen
      {...defaultProps}
      title="How React Server Components Work"
      isDone={true}
    />
  )
  expect(screen.getByRole('heading', { name: /How React Server Components Work/i })).toBeInTheDocument()
})


// ---------------------------------------------------------------------------
// Cycle 7 — accumulated script body is rendered
// ---------------------------------------------------------------------------

it('renders the accumulated script body', () => {
  const body = 'Alex: Welcome to DevCast.\nJordan: Thanks for having me.'
  render(<PreviewScreen {...defaultProps} scriptBody={body} />)
  expect(screen.getByText(/Alex: Welcome to DevCast/)).toBeInTheDocument()
  expect(screen.getByText(/Jordan: Thanks for having me/)).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

it('"Pick different articles" button appears and calls onBack', async () => {
  const user = userEvent.setup()
  const onBack = vi.fn()
  render(<PreviewScreen {...defaultProps} onBack={onBack} />)

  const backBtn = screen.getByRole('button', { name: /pick different articles/i })
  expect(backBtn).toBeInTheDocument()
  await user.click(backBtn)
  expect(onBack).toHaveBeenCalledOnce()
})

// ---------------------------------------------------------------------------
// Fetching meta state
// ---------------------------------------------------------------------------

it('shows "Generating title…" when isFetchingMeta is true', () => {
  render(<PreviewScreen {...defaultProps} isFetchingMeta={true} />)
  expect(screen.getByText(/generating title/i)).toBeInTheDocument()
})

it('does not show "Generating title…" when isFetchingMeta is false', () => {
  render(<PreviewScreen {...defaultProps} isFetchingMeta={false} />)
  expect(screen.queryByText(/generating title/i)).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Approve button disabled state
// ---------------------------------------------------------------------------

it('Approve button is disabled while isFetchingMeta is true', () => {
  render(<PreviewScreen {...defaultProps} isFetchingMeta={true} isDone={false} />)
  expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
})

it('Approve button is disabled when streaming (isDone=false)', () => {
  render(<PreviewScreen {...defaultProps} isDone={false} />)
  expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
})

it('Approve button is enabled when isDone is true', () => {
  render(
    <PreviewScreen
      {...defaultProps}
      title="Episode Title"
      description="A great episode"
      isDone={true}
    />
  )
  expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled()
})

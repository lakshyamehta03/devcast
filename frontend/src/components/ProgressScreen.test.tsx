import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressScreen } from './ProgressScreen'

const defaultProps = {
  progress: 0,
  phase: 'Starting…',
  error: null,
  onRetry: vi.fn(),
}

it('renders progress bar at given percentage', () => {
  render(<ProgressScreen {...defaultProps} progress={50} />)
  const bar = screen.getByRole('progressbar') as HTMLElement
  expect(bar.style.width).toBe('50%')
})

it('shows phase label', () => {
  render(<ProgressScreen {...defaultProps} phase="Generating audio..." />)
  expect(screen.getByText('Generating audio...')).toBeInTheDocument()
})

it('shows percentage text', () => {
  render(<ProgressScreen {...defaultProps} progress={42} />)
  expect(screen.getByText('42%')).toBeInTheDocument()
})

it('error modal appears when error is set', () => {
  render(<ProgressScreen {...defaultProps} error="TTS failed" />)
  expect(screen.getByText('TTS failed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
})

it('Try Again button calls onRetry', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  render(<ProgressScreen {...defaultProps} error="Upload failed" onRetry={onRetry} />)
  await user.click(screen.getByRole('button', { name: /try again/i }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('no error modal when error is null', () => {
  render(<ProgressScreen {...defaultProps} error={null} />)
  expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
})

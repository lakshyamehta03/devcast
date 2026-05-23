import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WizardScreen } from './WizardScreen'

const noop = () => {}
const okValidator = () => Promise.resolve('ok' as const)
const invalidValidator = () => Promise.resolve('invalid' as const)

describe('WizardScreen', () => {
  beforeEach(() => sessionStorage.clear())

  // Cycle 1: tracer bullet
  it('shows step 1 content on first render', () => {
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)
    expect(screen.getByRole('heading', { name: /daily\.dev/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /validate & continue/i })).toBeInTheDocument()
  })

  // Cycle 3: step 1 — valid PAT advances
  it('advances to step 2 when PAT validation succeeds', async () => {
    const user = userEvent.setup()
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)

    await user.type(screen.getByRole('textbox'), 'valid-pat-value')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    expect(await screen.findByText(/gemini/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  // Cycle 4: step 1 — invalid PAT shows error
  it('shows error message when PAT validation fails', async () => {
    const user = userEvent.setup()
    render(<WizardScreen onComplete={noop} validatePat={invalidValidator} />)

    await user.type(screen.getByRole('textbox'), 'bad-pat')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    expect(await screen.findByText(/invalid pat or no plus subscription/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /validate & continue/i })).toBeInTheDocument()
  })

  // Cycle 5: step 2 — Gemini key advances to step 3
  it('advances to step 3 after entering Gemini key', async () => {
    const user = userEvent.setup()
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)

    await user.type(screen.getByRole('textbox'), 'my-pat')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    await screen.findByText(/gemini/i)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'my-gemini-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/jina/i)).toBeInTheDocument()
  })

  // Cycle 6 + 7: step 3 — Jina key calls onComplete and writes sessionStorage
  it('calls onComplete and writes all keys to sessionStorage after step 3', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<WizardScreen onComplete={onComplete} validatePat={okValidator} />)

    // Step 1
    await user.type(screen.getByRole('textbox'), 'my-pat')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    // Step 2
    await screen.findByText(/gemini/i)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'my-gemini-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // Step 3
    await screen.findByText(/jina/i)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'my-jina-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onComplete).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('devcast.dailydev_pat')).toBe('my-pat')
    expect(sessionStorage.getItem('devcast.gemini_key')).toBe('my-gemini-key')
    expect(sessionStorage.getItem('devcast.jina_key')).toBe('my-jina-key')
  })
})

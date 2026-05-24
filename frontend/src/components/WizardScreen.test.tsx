import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WizardScreen } from './WizardScreen'

const noop = () => {}
const okValidator = () => Promise.resolve('ok' as const)
const invalidValidator = () => Promise.resolve('invalid' as const)

// Helper: build a minimal Response-like object for vi.spyOn(global, 'fetch')
const mockFetchResponse = (ok: boolean, status = ok ? 200 : 400) =>
  Promise.resolve({ ok, status } as Response)

describe('WizardScreen', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

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

  // Cycle 5: step 2 — Gemini key advances to step 3 (valid key)
  it('advances to step 3 after entering Gemini key', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response)
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
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response)
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

  // Gemini key validation — invalid key shows error
  it('shows error message when Gemini key validation fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response)
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)

    // Advance to step 2
    await user.type(screen.getByRole('textbox'), 'my-pat')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    await screen.findByText(/gemini/i)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'bad-gemini-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/invalid gemini api key/i)).toBeInTheDocument()
    // Still on step 2
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
    expect(screen.queryByText(/jina/i)).not.toBeInTheDocument()
  })

  // Gemini key validation — valid key advances to step 3
  it('advances to step 3 when Gemini key validation succeeds', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response)
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)

    await user.type(screen.getByRole('textbox'), 'my-pat')
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    await screen.findByText(/gemini/i)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'valid-gemini-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/jina/i)).toBeInTheDocument()
  })

  // Jina key validation — invalid key shows error
  it('shows error message when Jina key validation fails', async () => {
    const user = userEvent.setup()
    // Step 2 (Gemini) succeeds, step 3 (Jina) returns 401
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)  // Gemini
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response) // Jina
    render(<WizardScreen onComplete={noop} validatePat={okValidator} />)

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
    await user.type(screen.getByRole('textbox'), 'bad-jina-key')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/invalid jina api key/i)).toBeInTheDocument()
    // Still on step 3
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  // Jina key validation — valid key calls onComplete
  it('calls onComplete when Jina key validation succeeds', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response)
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

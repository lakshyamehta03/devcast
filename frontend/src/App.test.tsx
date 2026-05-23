import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const KEYS = {
  pat: 'devcast.dailydev_pat',
  gemini: 'devcast.gemini_key',
  jina: 'devcast.jina_key',
}

const emptyBookmarksResponse = {
  ok: true,
  status: 200,
  json: async () => ({ data: { edges: [] }, pageInfo: { hasNextPage: false, endCursor: null } }),
} as unknown as Response

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.spyOn(global, 'fetch').mockResolvedValue(emptyBookmarksResponse)
  })

  afterEach(() => vi.restoreAllMocks())

  // Cycle 2a: wizard shown when keys missing
  it('shows wizard when sessionStorage keys are absent', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /validate & continue/i })).toBeInTheDocument()
  })

  // Cycle 2b: wizard skipped when all three keys present
  it('skips wizard when all three keys are already in sessionStorage', () => {
    sessionStorage.setItem(KEYS.pat, 'p')
    sessionStorage.setItem(KEYS.gemini, 'g')
    sessionStorage.setItem(KEYS.jina, 'j')
    render(<App />)
    expect(screen.queryByRole('button', { name: /validate & continue/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /re-enter keys/i })).toBeInTheDocument()
  })

  // Cycle 8: re-enter keys clears sessionStorage and shows wizard
  it('clears sessionStorage and shows wizard when re-enter keys is clicked', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem(KEYS.pat, 'p')
    sessionStorage.setItem(KEYS.gemini, 'g')
    sessionStorage.setItem(KEYS.jina, 'j')
    render(<App />)

    await user.click(screen.getByRole('button', { name: /re-enter keys/i }))

    expect(screen.getByRole('button', { name: /validate & continue/i })).toBeInTheDocument()
    expect(sessionStorage.getItem(KEYS.pat)).toBeNull()
    expect(sessionStorage.getItem(KEYS.gemini)).toBeNull()
    expect(sessionStorage.getItem(KEYS.jina)).toBeNull()
  })
})

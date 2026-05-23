import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookmarksScreen } from './BookmarksScreen'

// Minimal bookmark shape used across tests
const makeBookmark = (id: string, title: string) => ({
  id,
  title,
  url: `https://example.com/${id}`,
  summary: `Summary for ${title}`,
  image: '',
  source: { name: 'DEV', image: '' },
  readTime: 3,
  numUpvotes: 10,
  tags: ['javascript'],
})

function mockFetch(bookmarks: ReturnType<typeof makeBookmark>[], hasNextPage = false) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      data: bookmarks,
      pagination: { hasNextPage, endCursor: null },
    }),
  } as unknown as Response)
}

beforeEach(() => {
  vi.restoreAllMocks()
  // Stub IntersectionObserver — jsdom doesn't implement it
  global.IntersectionObserver = vi.fn().mockReturnValue({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })
})

// ---------------------------------------------------------------------------
// Cycle 6 — tracer bullet: renders one card per bookmark
// ---------------------------------------------------------------------------

it('renders a card for each bookmark returned by the API', async () => {
  mockFetch([makeBookmark('p1', 'Post One'), makeBookmark('p2', 'Post Two')])

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  expect(await screen.findByText('Post One')).toBeInTheDocument()
  expect(screen.getByText('Post Two')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Cycle 7 — each card shows metadata fields (already covered by implementation)
// ---------------------------------------------------------------------------

it('each card shows source name, read time, upvote count, and tags', async () => {
  const bm = { ...makeBookmark('p1', 'Detailed Post'), readTime: 5, numUpvotes: 42, tags: ['typescript'], source: { name: 'Hashnode', image: 'https://example.com/hashnode.png' } }
  mockFetch([bm])

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  await screen.findByText('Detailed Post')
  expect(screen.getByText('Hashnode')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Hashnode' })).toHaveAttribute('src', 'https://example.com/hashnode.png')
  expect(screen.getByText(/5 min read/i)).toBeInTheDocument()
  expect(screen.getByText(/42 upvotes/i)).toBeInTheDocument()
  expect(screen.getByText('typescript')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Cycle 8 — clicking a card marks it selected
// ---------------------------------------------------------------------------

it('clicking a card marks it selected', async () => {
  const user = userEvent.setup()
  mockFetch([makeBookmark('p1', 'Selectable Post')])

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  const card = await screen.findByRole('listitem')
  expect(card).toHaveAttribute('data-selected', 'false')

  await user.click(card)
  expect(card).toHaveAttribute('data-selected', 'true')
})

// ---------------------------------------------------------------------------
// Cycle 9 — 3rd selection replaces oldest (FIFO)
// ---------------------------------------------------------------------------

it('selecting a 3rd card deselects the oldest', async () => {
  const user = userEvent.setup()
  mockFetch([makeBookmark('p1', 'First'), makeBookmark('p2', 'Second'), makeBookmark('p3', 'Third')])

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  await screen.findByText('First')
  const [card1, card2, card3] = screen.getAllByRole('listitem')

  await user.click(card1)
  await user.click(card2)
  await user.click(card3)

  expect(card1).toHaveAttribute('data-selected', 'false') // oldest dropped
  expect(card2).toHaveAttribute('data-selected', 'true')
  expect(card3).toHaveAttribute('data-selected', 'true')
})

// ---------------------------------------------------------------------------
// Cycle 10 — CTA disabled with 0 selected, enabled with 1+
// ---------------------------------------------------------------------------

it('"Generate Podcast!" is disabled until at least 1 card is selected', async () => {
  const user = userEvent.setup()
  mockFetch([makeBookmark('p1', 'Post One')])

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  await screen.findByText('Post One')
  const cta = screen.getByRole('button', { name: /generate podcast/i })
  expect(cta).toBeDisabled()

  await user.click(screen.getByRole('listitem'))
  expect(cta).not.toBeDisabled()
})

it('"Generate Podcast!" calls onGenerate with the selected bookmarks', async () => {
  const user = userEvent.setup()
  const onGenerate = vi.fn()
  mockFetch([makeBookmark('p1', 'Post One')])

  render(<BookmarksScreen pat="test-pat" onGenerate={onGenerate} onUnauthorized={vi.fn()} />)

  await screen.findByText('Post One')
  await user.click(screen.getByRole('listitem'))
  await user.click(screen.getByRole('button', { name: /generate podcast/i }))

  expect(onGenerate).toHaveBeenCalledOnce()
  expect(onGenerate.mock.calls[0][0][0].id).toBe('p1')
})

// ---------------------------------------------------------------------------
// Cycle 11 — 401 from /api/bookmarks calls onUnauthorized
// ---------------------------------------------------------------------------

it('calls onUnauthorized when the bookmarks API returns 401', async () => {
  const onUnauthorized = vi.fn()
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Unauthorized' }),
  } as unknown as Response)

  render(<BookmarksScreen pat="bad-pat" onGenerate={vi.fn()} onUnauthorized={onUnauthorized} />)

  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
})

// ---------------------------------------------------------------------------
// Cycle 12 — no loading sentinel when hasNextPage is false
// ---------------------------------------------------------------------------

it('does not render the loading sentinel when there are no more pages', async () => {
  mockFetch([makeBookmark('p1', 'Only Post')], false)

  render(<BookmarksScreen pat="test-pat" onGenerate={vi.fn()} onUnauthorized={vi.fn()} />)

  await screen.findByText('Only Post')
  expect(screen.queryByLabelText('Loading more')).not.toBeInTheDocument()
})

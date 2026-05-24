import { useEffect, useRef, useState } from 'react'

export interface BookmarkSource {
  name: string
  image: string
}

export interface Bookmark {
  id: string
  title: string
  url: string
  summary: string
  image: string
  source: BookmarkSource
  readTime: number
  numUpvotes: number
  tags: string[]
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface BookmarksScreenProps {
  pat: string
  onGenerate: (selectedIds: string[]) => void
  onUnauthorized: () => void
  isGenerating?: boolean
  extractError?: string | null
}

const API_BASE = '/api'

export function BookmarksScreen({ pat, onGenerate, onUnauthorized, isGenerating = false, extractError = null }: BookmarksScreenProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null })
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPage = async (cursor: string | null = null) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '20' })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${API_BASE}/bookmarks?${params}`, {
      headers: { Authorization: `Bearer ${pat}` },
    })

    if (res.status === 401) {
      onUnauthorized()
      return
    }

    const json = await res.json()
    const data: Bookmark[] = (json.data ?? []).filter(
      (b: Bookmark) => b.url
    )
    setBookmarks((prev) => cursor === null ? data : [...prev, ...data])
    setPageInfo(json.pagination ?? { hasNextPage: false, endCursor: null })
    setLoading(false)
  }

  useEffect(() => {
    fetchPage()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pageInfo.hasNextPage || !sentinelRef.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect()
        fetchPage(pageInfo.endCursor)
      }
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [pageInfo]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id] // FIFO: drop oldest
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div
        role="list"
        aria-label="Bookmarks"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 text-left"
      >
        {bookmarks.map((b) => {
          const isSelected = selected.includes(b.id)
          return (
            <div
              key={b.id}
              role="listitem"
              onClick={() => toggleSelect(b.id)}
              aria-pressed={isSelected}
              data-selected={isSelected}
              className={[
                'bg-card border rounded-lg p-4 cursor-pointer transition-all space-y-2',
                isSelected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground',
              ].join(' ')}
            >
              {b.image && <img src={b.image} alt="" className="w-full h-36 object-cover rounded-md" />}
              <h3 className="text-sm font-medium text-card-foreground leading-snug m-0">{b.title}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {b.source.image && (
                  <img src={b.source.image} alt={b.source.name} className="w-4 h-4 rounded-full" />
                )}
                <span>{b.source.name}</span>
                {b.readTime > 0 && <span>{b.readTime} min read</span>}
                <span>{b.numUpvotes} upvotes</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {b.tags.map((t) => (
                  <span key={t} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {pageInfo.hasNextPage && <div ref={sentinelRef} aria-label="Loading more" />}
      {loading && (
        <div aria-label="Loading" className="text-center text-muted-foreground text-sm py-4">
          Loading…
        </div>
      )}

      <div className="sticky bottom-0 p-4 bg-background/80 backdrop-blur border-t border-border">
        {extractError && (
          <p className="text-xs text-destructive text-center mb-2">{extractError}</p>
        )}
        <button
          disabled={selected.length === 0 || isGenerating}
          onClick={() => onGenerate(selected)}
          className="w-full max-w-sm mx-auto block bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating…' : 'Generate Podcast!'}
        </button>
        {selected.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            {selected.length} article{selected.length > 1 ? 's' : ''} selected
          </p>
        )}
      </div>
    </div>
  )
}

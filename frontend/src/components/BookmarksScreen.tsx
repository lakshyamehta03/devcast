import { useEffect, useRef, useState } from 'react'

export interface BookmarkSource {
  name: string
  image: string
}

export interface Bookmark {
  id: string
  title: string
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
  onGenerate: (selected: Bookmark[]) => void
  onUnauthorized: () => void
}

const API_BASE = '/api'

export function BookmarksScreen({ pat, onGenerate, onUnauthorized }: BookmarksScreenProps) {
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
    const edges: { node: Bookmark }[] = json.data?.edges ?? []
    setBookmarks((prev) => [...prev, ...edges.map((e) => e.node)])
    setPageInfo(json.pageInfo ?? { hasNextPage: false, endCursor: null })
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

  const selectedBookmarks = bookmarks.filter((b) => selected.includes(b.id))

  return (
    <div>
      <div role="list" aria-label="Bookmarks">
        {bookmarks.map((b) => (
          <div
            key={b.id}
            role="listitem"
            onClick={() => toggleSelect(b.id)}
            aria-pressed={selected.includes(b.id)}
            data-selected={selected.includes(b.id)}
            style={{ cursor: 'pointer', outline: selected.includes(b.id) ? '2px solid blue' : 'none' }}
          >
            {b.image && <img src={b.image} alt="" />}
            <h3>{b.title}</h3>
            {b.source.image && <img src={b.source.image} alt={b.source.name} />}
            <span>{b.source.name}</span>
            {b.readTime > 0 && <span>{b.readTime} min read</span>}
            <span>{b.numUpvotes} upvotes</span>
            {b.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        ))}
      </div>

      {pageInfo.hasNextPage && <div ref={sentinelRef} aria-label="Loading more" />}
      {loading && <div aria-label="Loading">Loading…</div>}

      <button
        disabled={selected.length === 0}
        onClick={() => onGenerate(selectedBookmarks)}
      >
        Generate Podcast!
      </button>
    </div>
  )
}

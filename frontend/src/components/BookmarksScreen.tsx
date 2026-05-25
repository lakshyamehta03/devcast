import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, ChevronUp, Mic2 } from 'lucide-react'

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

// Tag color palette — cycles deterministically by tag text
const TAG_COLORS = [
  'bg-violet-950/60 text-violet-300 border-violet-700/40',
  'bg-sky-950/60 text-sky-300 border-sky-700/40',
  'bg-emerald-950/60 text-emerald-300 border-emerald-700/40',
  'bg-amber-950/60 text-amber-300 border-amber-700/40',
  'bg-rose-950/60 text-rose-300 border-rose-700/40',
  'bg-cyan-950/60 text-cyan-300 border-cyan-700/40',
]
function tagColor(tag: string) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

// The badge shown inside a selected card (order: 1 or 2)
function SelectionBadge({ order }: { order: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-violet-500 border-2 border-violet-300/60 flex items-center justify-center shadow-lg shadow-violet-900/60"
    >
      <span className="text-white text-xs font-bold leading-none">{order}</span>
    </motion.div>
  )
}

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
    <div className="flex flex-col min-h-screen bg-[#0d0e14]">
      {/* Header strip */}
      <div className="px-5 pt-6 pb-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-500">
          Your bookmarks — pick up to 2
        </p>
      </div>

      {/* Card grid */}
      <div
        role="list"
        aria-label="Bookmarks"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-4 text-left"
      >
        {bookmarks.map((b) => {
          const isSelected = selected.includes(b.id)
          const selectionOrder = selected.indexOf(b.id) + 1 // 0 if not selected

          return (
            <motion.div
              key={b.id}
              role="listitem"
              onClick={() => toggleSelect(b.id)}
              aria-pressed={isSelected}
              data-selected={isSelected}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              className={[
                'relative flex flex-col rounded-xl cursor-pointer overflow-hidden',
                'border transition-all duration-200',
                'bg-[#13141c]',
                isSelected
                  ? 'border-violet-500/70 shadow-[0_0_0_1px_rgba(139,92,246,0.3),0_8px_32px_rgba(109,40,217,0.25)]'
                  : 'border-white/[0.06] hover:border-white/[0.14] shadow-[0_2px_12px_rgba(0,0,0,0.4)]',
              ].join(' ')}
            >
              {/* Selection order badge */}
              <AnimatePresence>
                {isSelected && <SelectionBadge order={selectionOrder} />}
              </AnimatePresence>

              {/* Selected overlay tint */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 z-10 pointer-events-none rounded-xl"
                    style={{ background: 'radial-gradient(ellipse at 70% 0%, rgba(109,40,217,0.12) 0%, transparent 70%)' }}
                  />
                )}
              </AnimatePresence>

              {/* Thumbnail */}
              {b.image ? (
                <div className="relative w-full h-40 overflow-hidden bg-zinc-900 shrink-0">
                  <img
                    src={b.image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Gradient fade to card bg */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#13141c]/80 via-transparent to-transparent" />
                </div>
              ) : (
                /* Placeholder strip when no image */
                <div className="w-full h-2 bg-gradient-to-r from-violet-900/40 via-indigo-900/30 to-transparent shrink-0" />
              )}

              {/* Card body */}
              <div className="flex flex-col gap-3 p-4 flex-1">
                {/* Title */}
                <h3 className="text-sm font-semibold text-zinc-100 leading-snug m-0 line-clamp-3">
                  {b.title}
                </h3>

                {/* Publisher row */}
                <div className="flex items-center gap-2 mt-auto">
                  {b.source.image ? (
                    <img
                      src={b.source.image}
                      alt={b.source.name}
                      className="w-4 h-4 rounded-full ring-1 ring-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-zinc-700 shrink-0" />
                  )}
                  <span className="text-xs text-zinc-400 font-medium truncate">{b.source.name}</span>

                  {/* Divider dot */}
                  <span className="text-zinc-700 text-xs select-none">·</span>

                  {/* Read time */}
                  {b.readTime > 0 && (
                    <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>{b.readTime} min read</span>
                    </span>
                  )}

                  {/* Upvotes — pushed right */}
                  <span className="flex items-center gap-1 text-xs text-zinc-500 ml-auto shrink-0">
                    <ChevronUp className="w-3.5 h-3.5 text-zinc-600" aria-hidden="true" />
                    <span>{b.numUpvotes} upvotes</span>
                  </span>
                </div>

                {/* Tags */}
                {b.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {b.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className={[
                          'text-[10px] font-medium px-2 py-0.5 rounded-full border',
                          tagColor(t),
                        ].join(' ')}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {pageInfo.hasNextPage && <div ref={sentinelRef} aria-label="Loading more" />}
      {loading && (
        <div aria-label="Loading" className="text-center text-zinc-600 text-xs tracking-widest uppercase py-6">
          Loading…
        </div>
      )}

      {/* Sticky bottom CTA bar */}
      <div className="sticky bottom-0 z-30 px-4 py-4 bg-[#0d0e14]/90 backdrop-blur-md border-t border-white/[0.07]">
        {extractError && (
          <p className="text-xs text-red-400 text-center mb-3 px-2">{extractError}</p>
        )}

        <div className="max-w-sm mx-auto space-y-2">
          <motion.button
            disabled={selected.length === 0 || isGenerating}
            onClick={() => onGenerate(selected)}
            whileTap={selected.length > 0 && !isGenerating ? { scale: 0.97 } : {}}
            className={[
              'w-full flex items-center justify-center gap-2.5',
              'rounded-xl px-5 py-3 text-sm font-semibold tracking-wide',
              'transition-all duration-200',
              selected.length === 0 || isGenerating
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_4px_24px_rgba(109,40,217,0.45)] hover:shadow-[0_4px_32px_rgba(139,92,246,0.55)] cursor-pointer',
            ].join(' ')}
          >
            <Mic2 className="w-4 h-4 shrink-0" />
            {isGenerating ? 'Generating…' : 'Generate Podcast!'}
          </motion.button>

          <AnimatePresence>
            {selected.length > 0 && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="text-[11px] text-zinc-500 text-center"
              >
                {selected.length === 1 ? '1 article selected' : '2 articles selected — ready to record'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

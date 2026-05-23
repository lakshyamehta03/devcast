import { useState } from 'react'
import { WizardScreen, STORAGE_KEYS } from './components/WizardScreen'
import { BookmarksScreen, type Bookmark } from './components/BookmarksScreen'
import { PreviewScreen } from './components/PreviewScreen'

type Stage = 'wizard' | 'bookmarks' | 'preview' | 'progress'

function allKeysPresent(): boolean {
  return (
    !!sessionStorage.getItem(STORAGE_KEYS.dailydevPat) &&
    !!sessionStorage.getItem(STORAGE_KEYS.geminiKey) &&
    !!sessionStorage.getItem(STORAGE_KEYS.jinaKey)
  )
}

async function validatePat(pat: string): Promise<'ok' | 'invalid'> {
  const res = await fetch('/api/bookmarks?limit=1', {
    headers: { Authorization: `Bearer ${pat}` },
  })
  return res.ok ? 'ok' : 'invalid'
}

function clearKeys() {
  sessionStorage.removeItem(STORAGE_KEYS.dailydevPat)
  sessionStorage.removeItem(STORAGE_KEYS.geminiKey)
  sessionStorage.removeItem(STORAGE_KEYS.jinaKey)
}

function parseSseChunk(chunk: string, onEvent: (event: string, data: unknown) => void) {
  const events = chunk.split('\n\n').filter(Boolean)
  for (const block of events) {
    const lines = block.split('\n')
    let event = ''
    let dataStr = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataStr = line.slice(5).trim()
    }
    if (event && dataStr) {
      try { onEvent(event, JSON.parse(dataStr)) } catch {}
    }
  }
}

export default function App() {
  const [stage, setStage] = useState<Stage>(allKeysPresent() ? 'bookmarks' : 'wizard')
  const [scriptTitle, setScriptTitle] = useState('')
  const [scriptBody, setScriptBody] = useState('')

  if (stage === 'wizard') {
    return (
      <WizardScreen
        onComplete={() => setStage('bookmarks')}
        validatePat={validatePat}
      />
    )
  }

  const pat = sessionStorage.getItem(STORAGE_KEYS.dailydevPat) ?? ''
  const jinaKey = sessionStorage.getItem(STORAGE_KEYS.jinaKey) ?? ''

  const handleGenerate = async (selected: Bookmark[]) => {
    const extractRes = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        jina_key: jinaKey,
        posts: selected.map(b => ({ id: b.id, url: b.url, summary: b.summary })),
      }),
    })
    if (!extractRes.ok) return
    const { posts } = await extractRes.json()

    const scriptRes = await fetch('/api/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        posts,
        post_meta: selected.map(b => ({ id: b.id, title: b.title })),
      }),
    })
    if (!scriptRes.ok || !scriptRes.body) return

    const reader = scriptRes.body.getReader()
    const decoder = new TextDecoder()

    const handleEvent = (event: string, data: unknown) => {
      if (event === 'meta') {
        const { title } = data as { title: string }
        setScriptTitle(title)
        setScriptBody('')
        setStage('preview')
      } else if (event === 'chunk') {
        const { text } = data as { text: string }
        setScriptBody(prev => prev + text)
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parseSseChunk(decoder.decode(value, { stream: true }), handleEvent)
    }
  }

  return (
    <div>
      <header className="flex items-center justify-end px-4 py-3 border-b border-border">
        <button
          onClick={() => {
            clearKeys()
            setStage('wizard')
          }}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Re-enter keys
        </button>
      </header>
      <main>
        {stage === 'bookmarks' && (
          <BookmarksScreen
            pat={pat}
            onGenerate={handleGenerate}
            onUnauthorized={() => {
              clearKeys()
              setStage('wizard')
            }}
          />
        )}
        {stage === 'preview' && (
          <PreviewScreen title={scriptTitle} scriptBody={scriptBody} />
        )}
        {/* progress — slice 6 */}
      </main>
    </div>
  )
}

import { useReducer } from 'react'
import { WizardScreen, STORAGE_KEYS } from './components/WizardScreen'
import { BookmarksScreen } from './components/BookmarksScreen'
import { PreviewScreen } from './components/PreviewScreen'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentDocument = { id: string; content: string; extraction_method: string }
type BookmarkMeta = {
  id: string
  title: string
  url: string
  publisher_name: string
  publisher_image: string | null
  image: string | null
}

type ScriptStatus =
  | { step: 'streaming'; body: string }
  | { step: 'fetching_meta'; body: string }
  | { step: 'done'; title: string; description: string; body: string }
  | { step: 'error'; message: string }

type AppState =
  | { stage: 'wizard' }
  | { stage: 'bookmarks'; error: string | null; isGenerating: boolean }
  | { stage: 'preview'; contentDocuments: ContentDocument[]; bookmarkMeta: BookmarkMeta[]; script: ScriptStatus }
  | { stage: 'progress'; title: string; description: string; scriptBody: string; bookmarkMeta: BookmarkMeta[] }
  | { stage: 'episode'; episodeUrl: string }

type Action =
  | { type: 'WIZARD_COMPLETE' }
  | { type: 'GENERATE_START' }
  | { type: 'EXTRACT_SUCCESS'; contentDocuments: ContentDocument[]; bookmarkMeta: BookmarkMeta[] }
  | { type: 'EXTRACT_ERROR'; message: string }
  | { type: 'SCRIPT_CHUNK'; text: string }
  | { type: 'SCRIPT_DONE' }
  | { type: 'SCRIPT_META'; title: string; description: string }
  | { type: 'SCRIPT_ERROR'; message: string }
  | { type: 'REGENERATE' }
  | { type: 'APPROVE' }
  | { type: 'BACK_TO_BOOKMARKS' }
  | { type: 'RESET_KEYS' }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'WIZARD_COMPLETE':
      return { stage: 'bookmarks', error: null, isGenerating: false }

    case 'GENERATE_START':
      if (state.stage !== 'bookmarks') return state
      return { ...state, isGenerating: true, error: null }

    case 'EXTRACT_SUCCESS':
      return {
        stage: 'preview',
        contentDocuments: action.contentDocuments,
        bookmarkMeta: action.bookmarkMeta,
        script: { step: 'streaming', body: '' },
      }

    case 'EXTRACT_ERROR':
      if (state.stage !== 'bookmarks') return state
      return { ...state, isGenerating: false, error: action.message }

    case 'SCRIPT_CHUNK':
      if (state.stage !== 'preview') return state
      if (state.script.step !== 'streaming') return state
      return {
        ...state,
        script: { step: 'streaming', body: state.script.body + action.text },
      }

    case 'SCRIPT_DONE':
      if (state.stage !== 'preview') return state
      if (state.script.step !== 'streaming') return state
      return {
        ...state,
        script: { step: 'fetching_meta', body: state.script.body },
      }

    case 'SCRIPT_META':
      if (state.stage !== 'preview') return state
      if (state.script.step !== 'fetching_meta') return state
      return {
        ...state,
        script: {
          step: 'done',
          title: action.title,
          description: action.description,
          body: state.script.body,
        },
      }

    case 'SCRIPT_ERROR':
      if (state.stage !== 'preview') return state
      return {
        ...state,
        script: { step: 'error', message: action.message },
      }

    case 'REGENERATE':
      if (state.stage !== 'preview') return state
      return {
        ...state,
        script: { step: 'streaming', body: '' },
      }

    case 'APPROVE':
      if (state.stage !== 'preview') return state
      if (state.script.step !== 'done') return state
      return {
        stage: 'progress',
        title: state.script.title,
        description: state.script.description,
        scriptBody: state.script.body,
        bookmarkMeta: state.bookmarkMeta,
      }

    case 'BACK_TO_BOOKMARKS':
      return { stage: 'bookmarks', error: null, isGenerating: false }

    case 'RESET_KEYS':
      clearKeys()
      return { stage: 'wizard' }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createSseParser(onEvent: (event: string, data: unknown) => void) {
  let buffer = ''
  return {
    feed(chunk: string) {
      buffer += chunk
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        if (!block.trim()) continue
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
    },
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function getInitialState(): AppState {
  return allKeysPresent()
    ? { stage: 'bookmarks', error: null, isGenerating: false }
    : { stage: 'wizard' }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState)

  const pat = sessionStorage.getItem(STORAGE_KEYS.dailydevPat) ?? ''
  const jinaKey = sessionStorage.getItem(STORAGE_KEYS.jinaKey) ?? ''

  const runScriptStream = async (contentDocuments: ContentDocument[]) => {
    const scriptRes = await fetch('/api/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_documents: contentDocuments }),
    })
    if (!scriptRes.ok || !scriptRes.body) {
      dispatch({ type: 'SCRIPT_ERROR', message: 'Script generation failed. Please try again.' })
      return
    }

    const reader = scriptRes.body.getReader()
    const decoder = new TextDecoder()
    let finalBody = ''

    const parser = createSseParser((event, data) => {
      if (event === 'chunk') {
        const { text } = data as { text: string }
        finalBody += text
        dispatch({ type: 'SCRIPT_CHUNK', text })
      } else if (event === 'done') {
        dispatch({ type: 'SCRIPT_DONE' })
      } else if (event === 'error') {
        const { user_message } = data as { phase: string; user_message: string }
        dispatch({ type: 'SCRIPT_ERROR', message: user_message })
      }
    })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
    }

    // After streaming done, fetch meta
    try {
      const metaRes = await fetch('/api/script/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: finalBody }),
      })
      if (metaRes.ok) {
        const { title, description } = await metaRes.json()
        dispatch({ type: 'SCRIPT_META', title, description })
      } else {
        dispatch({ type: 'SCRIPT_ERROR', message: 'Failed to generate episode title. Please try again.' })
      }
    } catch {
      dispatch({ type: 'SCRIPT_ERROR', message: 'Failed to generate episode title. Please try again.' })
    }
  }

  const handleGenerate = async (selectedIds: string[]) => {
    dispatch({ type: 'GENERATE_START' })

    const extractRes = await fetch('/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pat}`,
        'X-Jina-Key': jinaKey,
      },
      body: JSON.stringify({ bookmark_ids: selectedIds }),
    })

    if (!extractRes.ok) {
      dispatch({ type: 'EXTRACT_ERROR', message: 'Failed to extract article content. Please try again.' })
      return
    }

    const { content_documents, bookmarks } = await extractRes.json()
    dispatch({
      type: 'EXTRACT_SUCCESS',
      contentDocuments: content_documents,
      bookmarkMeta: bookmarks,
    })

    await runScriptStream(content_documents)
  }

  const handleRegenerate = async () => {
    if (state.stage !== 'preview') return
    dispatch({ type: 'REGENERATE' })
    await runScriptStream(state.contentDocuments)
  }

  if (state.stage === 'wizard') {
    return (
      <WizardScreen
        onComplete={() => dispatch({ type: 'WIZARD_COMPLETE' })}
        validatePat={validatePat}
      />
    )
  }

  return (
    <div>
      <header className="flex items-center justify-end px-4 py-3 border-b border-border">
        <button
          onClick={() => dispatch({ type: 'RESET_KEYS' })}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Re-enter keys
        </button>
      </header>
      <main>
        {state.stage === 'bookmarks' && (
          <BookmarksScreen
            pat={pat}
            onGenerate={handleGenerate}
            onUnauthorized={() => dispatch({ type: 'RESET_KEYS' })}
            isGenerating={state.isGenerating}
            extractError={state.error}
          />
        )}
        {state.stage === 'preview' && (
          <PreviewScreen
            title={state.script.step === 'done' ? state.script.title : null}
            description={state.script.step === 'done' ? state.script.description : null}
            scriptBody={state.script.step !== 'error' ? state.script.body : ''}
            isDone={state.script.step === 'done'}
            isFetchingMeta={state.script.step === 'fetching_meta'}
            onApprove={() => dispatch({ type: 'APPROVE' })}
            onRegenerate={handleRegenerate}
            onBack={() => dispatch({ type: 'BACK_TO_BOOKMARKS' })}
            error={state.script.step === 'error' ? state.script.message : null}
            onRetry={handleRegenerate}
          />
        )}
        {state.stage === 'progress' && <div>Progress — slice 6</div>}
        {state.stage === 'episode' && <div>Episode — redirect</div>}
      </main>
    </div>
  )
}

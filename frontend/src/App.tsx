import { useReducer, useEffect } from 'react'
import { WizardScreen, STORAGE_KEYS } from './components/WizardScreen'
import { BookmarksScreen } from './components/BookmarksScreen'
import { PreviewScreen } from './components/PreviewScreen'
import { ProgressScreen } from './components/ProgressScreen'

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
  | {
      stage: 'progress';
      title: string;
      description: string;
      scriptBody: string;
      bookmarkMeta: BookmarkMeta[];
      progress: number;
      phase: string;
      error: string | null;
      pcmAudio: Uint8Array | null;
    }
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
  | { type: 'TTS_PROGRESS'; progress: number }
  | { type: 'TTS_DONE'; pcmAudio: Uint8Array }
  | { type: 'TTS_ERROR'; message: string }
  | { type: 'FINALIZE_PROGRESS'; progress: number; phase: string }
  | { type: 'FINALIZE_COMPLETE'; episodeUrl: string }
  | { type: 'FINALIZE_ERROR'; message: string }
  | { type: 'PROGRESS_RETRY' }
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
        progress: 0,
        phase: 'Generating audio...',
        error: null,
        pcmAudio: null,
      }

    case 'TTS_PROGRESS':
      if (state.stage !== 'progress') return state
      return { ...state, progress: Math.min(69, action.progress) }

    case 'TTS_DONE':
      if (state.stage !== 'progress') return state
      return { ...state, pcmAudio: action.pcmAudio, progress: 70, phase: 'Uploading...' }

    case 'TTS_ERROR':
      if (state.stage !== 'progress') return state
      return { ...state, error: action.message }

    case 'FINALIZE_PROGRESS':
      if (state.stage !== 'progress') return state
      return { ...state, progress: action.progress, phase: action.phase }

    case 'FINALIZE_COMPLETE':
      return { stage: 'episode', episodeUrl: action.episodeUrl }

    case 'FINALIZE_ERROR':
      if (state.stage !== 'progress') return state
      return { ...state, error: action.message }

    case 'PROGRESS_RETRY':
      if (state.stage !== 'progress') return state
      return { ...state, error: null, progress: 0, phase: 'Generating audio...', pcmAudio: null }

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

  const runTtsAndFinalize = async () => {
    if (state.stage !== 'progress') return
    const geminiKey = sessionStorage.getItem(STORAGE_KEYS.geminiKey) ?? ''

    // Timer-based progress 0→69% over ~12s
    const startTime = Date.now()
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      const progress = Math.min(69, Math.floor((elapsed / 12) * 69))
      dispatch({ type: 'TTS_PROGRESS', progress })
    }, 200)

    try {
      // Call Gemini TTS
      const ttsRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "This is an episode of DevCast, a developer podcast. Alex is the lead engineer, precise and opinionated. Jordan is an experienced skeptic who challenges assumptions." },
                { text: state.scriptBody },
              ]
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    { speaker: "Alex", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Sadachbia" } } },
                    { speaker: "Jordan", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
                  ]
                }
              }
            }
          })
        }
      )

      clearInterval(progressInterval)

      if (!ttsRes.ok) {
        if (ttsRes.status === 401) {
          dispatch({ type: 'TTS_ERROR', message: 'Invalid Gemini API key.' })
        } else if (ttsRes.status === 429) {
          dispatch({ type: 'TTS_ERROR', message: 'Gemini rate limit reached. Please wait and try again.' })
        } else {
          dispatch({ type: 'TTS_ERROR', message: 'Audio generation failed. Please try again.' })
        }
        return
      }

      const data = await ttsRes.json()
      const audioPart = data.candidates[0].content.parts.find((p: { inlineData?: unknown }) => p.inlineData)
      const b64 = (audioPart.inlineData as { data: string }).data
      const pcm = Uint8Array.from(atob(b64), c => c.charCodeAt(0))

      dispatch({ type: 'TTS_DONE', pcmAudio: pcm })

      // Now finalize
      const metadata = JSON.stringify({
        title: state.title,
        description: state.description,
        script: state.scriptBody,
        source_bookmarks: state.bookmarkMeta.map(b => ({
          id: b.id,
          title: b.title,
          url: b.url,
          publisher_name: b.publisher_name,
          image: b.image,
        })),
      })

      const formData = new FormData()
      formData.append('metadata', new Blob([metadata], { type: 'application/json' }), 'metadata.json')
      formData.append('audio', new Blob([pcm], { type: 'application/octet-stream' }), 'audio.pcm')

      const finalizeRes = await fetch('/api/episodes/finalize', {
        method: 'POST',
        body: formData,
      })

      if (!finalizeRes.ok || !finalizeRes.body) {
        dispatch({ type: 'FINALIZE_ERROR', message: 'Upload failed. Please try again.' })
        return
      }

      const reader = finalizeRes.body.getReader()
      const decoder = new TextDecoder()
      const parser = createSseParser((event, eventData) => {
        const snapPoints: Record<string, [number, string]> = {
          upload_received: [75, 'Transcoding...'],
          transcoding: [85, 'Transcoding...'],
          s3_audio: [93, 'Saving...'],
          s3_metadata: [98, 'Saving...'],
        }
        if (event === 'complete') {
          const { episode_url } = eventData as { episode_id: string; episode_url: string }
          dispatch({ type: 'FINALIZE_COMPLETE', episodeUrl: episode_url })
          window.location.assign(episode_url)
        } else if (event === 'error') {
          const { user_message } = eventData as { phase: string; user_message: string }
          dispatch({ type: 'FINALIZE_ERROR', message: user_message })
        } else if (snapPoints[event]) {
          const [progress, phase] = snapPoints[event]
          dispatch({ type: 'FINALIZE_PROGRESS', progress, phase })
        }
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }

    } catch (err) {
      clearInterval(progressInterval)
      dispatch({ type: 'TTS_ERROR', message: 'Audio generation failed. Please try again.' })
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state.stage === 'progress' && state.pcmAudio === null && state.error === null) {
      runTtsAndFinalize()
    }
  }, [state.stage, state.error, state.pcmAudio])

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
        {state.stage === 'progress' && (
          <ProgressScreen
            progress={state.progress}
            phase={state.phase}
            error={state.error}
            onRetry={() => dispatch({ type: 'PROGRESS_RETRY' })}
          />
        )}
      </main>
    </div>
  )
}

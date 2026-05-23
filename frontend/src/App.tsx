import { useState } from 'react'
import { WizardScreen, STORAGE_KEYS } from './components/WizardScreen'
import { BookmarksScreen, type Bookmark } from './components/BookmarksScreen'

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

export default function App() {
  const [stage, setStage] = useState<Stage>(allKeysPresent() ? 'bookmarks' : 'wizard')

  if (stage === 'wizard') {
    return (
      <WizardScreen
        onComplete={() => setStage('bookmarks')}
        validatePat={validatePat}
      />
    )
  }

  const pat = sessionStorage.getItem(STORAGE_KEYS.dailydevPat) ?? ''

  const handleGenerate = (_selected: Bookmark[]) => {
    setStage('preview')
  }

  return (
    <div>
      <header>
        <button
          onClick={() => {
            clearKeys()
            setStage('wizard')
          }}
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
        {/* preview / progress — slices #4+ */}
      </main>
    </div>
  )
}

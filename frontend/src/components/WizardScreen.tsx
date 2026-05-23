import { useState } from 'react'

export const STORAGE_KEYS = {
  dailydevPat: 'devcast.dailydev_pat',
  geminiKey: 'devcast.gemini_key',
  jinaKey: 'devcast.jina_key',
} as const

interface WizardScreenProps {
  onComplete: () => void
  validatePat: (pat: string) => Promise<'ok' | 'invalid'>
}

type Step = 1 | 2 | 3

export function WizardScreen({ onComplete, validatePat }: WizardScreenProps) {
  const [step, setStep] = useState<Step>(1)
  const [value, setValue] = useState('')
  const [patError, setPatError] = useState(false)
  const [pat, setPat] = useState('')
  const [geminiKey, setGeminiKey] = useState('')

  const handleStep1 = async () => {
    const result = await validatePat(value)
    if (result === 'ok') {
      setPat(value)
      setValue('')
      setPatError(false)
      setStep(2)
    } else {
      setPatError(true)
    }
  }

  const handleStep2 = () => {
    setGeminiKey(value)
    setValue('')
    setStep(3)
  }

  const handleStep3 = () => {
    const jinaKey = value
    sessionStorage.setItem(STORAGE_KEYS.dailydevPat, pat)
    sessionStorage.setItem(STORAGE_KEYS.geminiKey, geminiKey)
    sessionStorage.setItem(STORAGE_KEYS.jinaKey, jinaKey)
    onComplete()
  }

  if (step === 1) {
    return (
      <div>
        <h1>Connect your daily.dev account</h1>
        <p>
          Enter your daily.dev Personal Access Token. You need a Plus subscription.{' '}
          <a href="https://app.daily.dev/settings/api" target="_blank" rel="noreferrer">
            Get your token
          </a>
        </p>
        {patError && <p role="alert">Invalid PAT or no Plus subscription</p>}
        <input
          type="text"
          aria-label="daily.dev PAT"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button onClick={handleStep1}>Validate &amp; Continue</button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div>
        <h1>Add your Gemini API key</h1>
        <p>
          Used for text-to-speech. The free tier gives ~500k characters/month.{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            Get your key
          </a>
        </p>
        <input
          type="text"
          aria-label="Gemini API key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button onClick={handleStep2}>Continue</button>
      </div>
    )
  }

  return (
    <div>
      <h1>Add your Jina API key</h1>
      <p>
        Used for article extraction. The free tier gives 1M tokens/month.{' '}
        <a href="https://jina.ai/api-dashboard" target="_blank" rel="noreferrer">
          Get your key
        </a>
      </p>
      <input
        type="text"
        aria-label="Jina API key"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button onClick={handleStep3}>Continue</button>
    </div>
  )
}

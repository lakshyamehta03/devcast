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

// Shared primitives — replace with shadcn/ui <Input> / <Button> / <Card> during polish
const inputCls =
  'w-full bg-input border border-border rounded-md px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring'
const btnCls =
  'w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-40'

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-md space-y-4 bg-card border border-border rounded-xl p-8 text-left shadow-md">
        {children}
      </div>
    </div>
  )
}

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
      <WizardCard>
        <h1 className="text-2xl font-semibold text-foreground m-0">Connect your daily.dev account</h1>
        <p className="text-sm text-muted-foreground">
          Enter your daily.dev Personal Access Token. You need a Plus subscription.{' '}
          <a href="https://app.daily.dev/settings/api" target="_blank" rel="noreferrer" className="underline text-foreground">
            Get your token
          </a>
        </p>
        {patError && (
          <p role="alert" className="text-destructive text-sm">
            Invalid PAT or no Plus subscription
          </p>
        )}
        <input
          type="text"
          aria-label="daily.dev PAT"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputCls}
          placeholder="paste your PAT here"
        />
        <button onClick={handleStep1} className={btnCls}>
          Validate &amp; Continue
        </button>
      </WizardCard>
    )
  }

  if (step === 2) {
    return (
      <WizardCard>
        <h1 className="text-2xl font-semibold text-foreground m-0">Add your Gemini API key</h1>
        <p className="text-sm text-muted-foreground">
          Used for text-to-speech. The free tier gives ~500k characters/month.{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-foreground">
            Get your key
          </a>
        </p>
        <input
          type="text"
          aria-label="Gemini API key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputCls}
          placeholder="AIza..."
        />
        <button onClick={handleStep2} className={btnCls}>
          Continue
        </button>
      </WizardCard>
    )
  }

  return (
    <WizardCard>
      <h1 className="text-2xl font-semibold text-foreground m-0">Add your Jina API key</h1>
      <p className="text-sm text-muted-foreground">
        Used for article extraction. The free tier gives 1M tokens/month.{' '}
        <a href="https://jina.ai/api-dashboard" target="_blank" rel="noreferrer" className="underline text-foreground">
          Get your key
        </a>
      </p>
      <input
        type="text"
        aria-label="Jina API key"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
        placeholder="jina_..."
      />
      <button onClick={handleStep3} className={btnCls}>
        Continue
      </button>
    </WizardCard>
  )
}

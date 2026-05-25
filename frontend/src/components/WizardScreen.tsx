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

const TOTAL_STEPS = 3

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-3 mb-8" aria-label={`Step ${current} of ${TOTAL_STEPS}`}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const stepNum = (i + 1) as Step
        const isComplete = stepNum < current
        const isActive = stepNum === current
        return (
          <div key={stepNum} className="flex items-center gap-3">
            <div
              className={[
                'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all duration-300',
                isActive
                  ? 'bg-foreground text-background'
                  : isComplete
                  ? 'bg-muted-foreground/30 text-muted-foreground'
                  : 'bg-muted text-muted-foreground/40',
              ].join(' ')}
              aria-hidden="true"
            >
              {isComplete ? (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                stepNum
              )}
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div
                className={[
                  'w-8 h-px transition-colors duration-300',
                  isComplete ? 'bg-muted-foreground/40' : 'bg-border',
                ].join(' ')}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function KeyField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="group relative">
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          'w-full bg-transparent border border-border rounded-lg px-4 py-3',
          'font-mono text-sm text-foreground placeholder:text-muted-foreground/40',
          'focus:outline-none focus:border-foreground/50 focus:ring-0',
          'transition-colors duration-150',
        ].join(' ')}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'w-full flex items-center justify-center gap-2',
        'bg-foreground text-background rounded-lg px-4 py-2.5',
        'text-sm font-medium tracking-tight',
        'hover:opacity-85 active:scale-[0.99]',
        'disabled:opacity-35 disabled:cursor-not-allowed',
        'transition-all duration-150',
      ].join(' ')}
    >
      {loading ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
          <span>Checking…</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1.5 text-destructive text-xs font-medium"
    >
      <span className="inline-block w-1 h-1 rounded-full bg-destructive flex-shrink-0" />
      {message}
    </p>
  )
}

function WizardShell({ step, children }: { step: Step; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-16 bg-background">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="flex items-center gap-2 mb-12">
          <div className="w-7 h-7 rounded-md bg-foreground flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="4" cy="7" r="2" fill="currentColor" className="text-background" />
              <circle cx="10" cy="7" r="2" fill="currentColor" className="text-background opacity-60" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">DevCast</span>
        </div>

        <StepIndicator current={step} />

        <div className="space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}

export function WizardScreen({ onComplete, validatePat }: WizardScreenProps) {
  const [step, setStep] = useState<Step>(1)
  const [value, setValue] = useState('')
  const [patError, setPatError] = useState(false)
  const [geminiError, setGeminiError] = useState(false)
  const [jinaError, setJinaError] = useState(false)
  const [loading, setLoading] = useState(false)
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

  const handleStep2 = async () => {
    setLoading(true)
    setGeminiError(false)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${value}`
      )
      if (res.ok) {
        setGeminiKey(value)
        setValue('')
        setStep(3)
      } else {
        setGeminiError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStep3 = async () => {
    setLoading(true)
    setJinaError(false)
    try {
      const res = await fetch('https://r.jina.ai/https://example.com', {
        headers: {
          Authorization: `Bearer ${value}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const jinaKey = value
        sessionStorage.setItem(STORAGE_KEYS.dailydevPat, pat)
        sessionStorage.setItem(STORAGE_KEYS.geminiKey, geminiKey)
        sessionStorage.setItem(STORAGE_KEYS.jinaKey, jinaKey)
        onComplete()
      } else {
        setJinaError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <WizardShell step={1}>
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight leading-tight m-0">
            Connect your daily.dev account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Requires a Plus subscription.{' '}
            <a
              href="https://app.daily.dev/settings/api"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
            >
              Get your PAT
            </a>
          </p>
        </div>

        {patError && <ErrorAlert message="Invalid PAT or no Plus subscription" />}

        <KeyField
          label="daily.dev PAT"
          value={value}
          onChange={setValue}
          placeholder="paste your PAT here"
        />

        <ActionButton onClick={handleStep1}>
          Validate &amp; Continue
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ActionButton>
      </WizardShell>
    )
  }

  if (step === 2) {
    return (
      <WizardShell step={2}>
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight leading-tight m-0">
            Add your Gemini API key
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Powers text-to-speech. Free tier: ~500k chars/month.{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
            >
              Get your key
            </a>
          </p>
        </div>

        {geminiError && <ErrorAlert message="Invalid Gemini API key" />}

        <KeyField
          label="Gemini API key"
          value={value}
          onChange={setValue}
          placeholder="AIza..."
        />

        <ActionButton onClick={handleStep2} loading={loading}>
          Continue
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ActionButton>
      </WizardShell>
    )
  }

  return (
    <WizardShell step={3}>
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight leading-tight m-0">
          Add your Jina API key
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Used for article extraction. Free tier: 1M tokens/month.{' '}
          <a
            href="https://jina.ai/api-dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
          >
            Get your key
          </a>
        </p>
      </div>

      {jinaError && <ErrorAlert message="Invalid Jina API key" />}

      <KeyField
        label="Jina API key"
        value={value}
        onChange={setValue}
        placeholder="jina_..."
      />

      <ActionButton onClick={handleStep3} loading={loading}>
        Continue
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ActionButton>
    </WizardShell>
  )
}

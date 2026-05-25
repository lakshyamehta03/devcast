interface PreviewScreenProps {
  title: string | null
  description: string | null
  scriptBody: string
  isDone: boolean
  isFetchingMeta: boolean
  onApprove: () => void
  onRegenerate: () => void
  onBack: () => void
  error: string | null
  onRetry: () => void
}

// Render script lines with speaker color cues via left-border accent
function renderScript(body: string) {
  if (!body) return null
  const lines = body.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('Alex:')) {
      return (
        <p key={i} className="pl-4 border-l-[3px] border-[#60a5fa] my-1 leading-7 text-foreground/90">
          {line}
        </p>
      )
    }
    if (line.startsWith('Jordan:')) {
      return (
        <p key={i} className="pl-4 border-l-[3px] border-[#a78bfa] my-1 leading-7 text-foreground/90">
          {line}
        </p>
      )
    }
    return (
      <p key={i} className={`my-0 leading-7 ${line === '' ? 'h-3' : 'text-muted-foreground/60 text-xs italic'}`}>
        {line}
      </p>
    )
  })
}

export function PreviewScreen({
  title,
  description,
  scriptBody,
  isDone,
  isFetchingMeta,
  onApprove,
  onRegenerate,
  onBack,
  error,
  onRetry,
}: PreviewScreenProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Back link */}
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer mb-8 tracking-wide"
        >
          <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
          Pick different articles
        </button>

        {/* Episode header */}
        <div className="mb-8 space-y-2">
          {isFetchingMeta ? (
            <div className="h-8 w-64 rounded-md bg-muted/40 animate-pulse" aria-label="Generating title…">
              <span className="sr-only">Generating title…</span>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-foreground tracking-tight leading-snug m-0">
              {title ?? ''}
            </h1>
          )}
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>

        {/* Script body or error */}
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 space-y-3 mb-8"
          >
            <p className="text-sm text-destructive leading-relaxed">{error}</p>
            <button
              onClick={onRetry}
              className="text-xs font-medium text-destructive hover:text-destructive/80 underline underline-offset-2 cursor-pointer transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm px-6 py-5 mb-8 font-mono text-sm leading-7 whitespace-pre-wrap min-h-[200px]">
            {renderScript(scriptBody)}
            {!isDone && scriptBody && (
              <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={onRegenerate}
            className="text-sm px-4 py-2 rounded-lg border border-border/70 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-all cursor-pointer"
          >
            Regenerate
          </button>
          <button
            disabled={!isDone}
            onClick={onApprove}
            className="text-sm px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium cursor-pointer hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity shadow-sm shadow-primary/20"
          >
            Approve &amp; Record
          </button>
        </div>

      </div>
    </div>
  )
}

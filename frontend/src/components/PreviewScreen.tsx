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
    <div className="max-w-2xl mx-auto px-4 py-8 text-left space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        ← Pick different articles
      </button>

      <div className="space-y-1">
        {isFetchingMeta ? (
          <p className="text-sm text-muted-foreground italic">Generating title…</p>
        ) : (
          <h1 className="text-2xl font-semibold text-foreground m-0">{title ?? ''}</h1>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={onRetry}
            className="text-sm text-primary hover:opacity-80 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-sans">
          {scriptBody}
        </pre>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onRegenerate}
          className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted-foreground cursor-pointer"
        >
          Regenerate
        </button>
        <button
          disabled={!isDone}
          onClick={onApprove}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Approve &amp; Record
        </button>
      </div>
    </div>
  )
}

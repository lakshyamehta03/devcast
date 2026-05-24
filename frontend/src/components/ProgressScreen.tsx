interface ProgressScreenProps {
  progress: number
  phase: string
  error: string | null
  onRetry: () => void
}

export function ProgressScreen({ progress, phase, error, onRetry }: ProgressScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-md space-y-4 bg-card border border-border rounded-xl p-8 shadow-md">
        <h1 className="text-xl font-semibold text-foreground text-center">Creating your episode…</h1>

        <div className="bg-muted rounded-full h-3 w-full overflow-hidden">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-primary h-full rounded-full"
            style={{ width: `${progress}%`, transition: 'width 0.5s ease' }}
          />
        </div>

        <p className="text-sm text-muted-foreground text-center mt-4">{phase}</p>
        <p className="text-xs text-muted-foreground text-center mt-1">{progress}%</p>
      </div>

      {error !== null && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-lg space-y-4 mx-4">
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={onRetry}
              className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

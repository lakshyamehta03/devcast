interface ProgressScreenProps {
  progress: number
  phase: string
  error: string | null
  onRetry: () => void
}

export function ProgressScreen({ progress, phase, error, onRetry }: ProgressScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 bg-background">

      {/* Main card */}
      <div className="w-full max-w-md space-y-6 bg-card/40 border border-border/60 rounded-2xl p-8 backdrop-blur-sm">

        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-foreground tracking-tight">Creating your episode</h1>
          <p className="text-xs text-muted-foreground/60 tracking-wider uppercase">DevCast Studio</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-full h-1.5 w-full overflow-hidden">
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-full rounded-full relative overflow-hidden"
              style={{
                width: `${progress}%`,
                transition: 'width 0.5s ease',
                background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 100%)',
                boxShadow: progress > 0 ? '0 0 8px rgba(167,139,250,0.5)' : 'none',
              }}
            />
          </div>

          {/* Phase + percentage row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{phase}</p>
            <p className="text-sm tabular-nums font-medium text-foreground/70">{progress}%</p>
          </div>
        </div>

        {/* Waveform decoration — static dots suggesting audio activity */}
        <div className="flex items-end justify-center gap-1 h-6 opacity-30">
          {[3, 5, 8, 6, 10, 7, 4, 9, 6, 5, 8, 4, 7, 5, 3].map((h, i) => (
            <div
              key={i}
              className="w-0.5 rounded-full bg-primary"
              style={{ height: `${h * 2}px` }}
            />
          ))}
        </div>

      </div>

      {/* Error modal */}
      {error !== null && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div
            role="alert"
            className="w-full max-w-sm bg-card border border-border/80 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in-0 zoom-in-95 duration-200"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
            </div>
            <button
              onClick={onRetry}
              className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

interface PreviewScreenProps {
  title: string
  scriptBody: string
}

export function PreviewScreen({ title, scriptBody }: PreviewScreenProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-left space-y-4">
      <h1 className="text-2xl font-semibold text-foreground m-0">{title}</h1>
      <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-sans">
        {scriptBody}
      </pre>
    </div>
  )
}

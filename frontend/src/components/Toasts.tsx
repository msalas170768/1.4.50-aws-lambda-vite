import type { Toast } from '../hooks/useToasts'

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="row-in pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-ink py-2.5 pl-4 pr-2 text-sm text-sheet shadow-lg"
        >
          <span className={`size-2 shrink-0 rounded-full ${t.kind === 'error' ? 'bg-margin' : 'bg-sheet/60'}`} aria-hidden />
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Cerrar aviso"
            className="rounded px-2 font-mono text-xs text-sheet/70 hover:text-sheet"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

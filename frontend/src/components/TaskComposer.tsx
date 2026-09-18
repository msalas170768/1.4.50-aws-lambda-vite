import { useState, type FormEvent } from 'react'
import { PlusIcon } from './Icons'

export const MAX_TITLE = 200

export function TaskComposer({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const trimmed = title.trim()
  const remaining = MAX_TITLE - title.length

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    setTitle('')
    try {
      await onAdd(trimmed)
    } catch {
      setTitle(trimmed) // devolvemos el texto para que no se pierda
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-rule sm:grid-cols-[4rem_minmax(0,1fr)]">
      <div className="flex items-center justify-center border-r-2 border-margin/70 text-ink-soft">
        <PlusIcon />
      </div>
      <div className="flex items-center gap-3 py-3 pl-4 pr-3">
        <label htmlFor="new-task" className="sr-only">
          Nueva tarea
        </label>
        <input
          id="new-task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          autoComplete="off"
          placeholder="Añade una tarea…"
          className="min-w-0 flex-1 bg-transparent text-lg italic outline-none placeholder:text-ink-soft/70 focus-visible:outline-none"
        />
        {remaining <= 40 && (
          <span className="font-mono text-xs text-ink-soft" aria-live="polite">
            {remaining}
          </span>
        )}
        <button
          type="submit"
          disabled={!trimmed}
          className="rounded-full bg-ink px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-sheet transition-opacity disabled:opacity-30"
        >
          Añadir
        </button>
      </div>
    </form>
  )
}

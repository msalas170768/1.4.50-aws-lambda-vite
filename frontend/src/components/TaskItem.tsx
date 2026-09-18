import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Task } from '../api'
import { fullDate, relativeTime } from '../lib/time'
import { CheckIcon, PencilIcon, TrashIcon } from './Icons'
import { MAX_TITLE } from './TaskComposer'

interface Props {
  task: Task
  saving: boolean
  now: number
  onToggle: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function TaskItem({ task, saving, now, onToggle, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function startEdit() {
    if (saving) return
    setDraft(task.title)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const title = draft.trim()
    if (title && title !== task.title) onRename(title)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  const iconButton =
    'grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-rule/60 hover:text-ink disabled:opacity-30'

  return (
    <li
      className={`row-in group grid grid-cols-[3rem_minmax(0,1fr)] border-b border-rule last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)] ${saving ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-center border-r-2 border-margin/70 pt-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? `Marcar "${task.title}" como pendiente` : `Completar "${task.title}"`}
          onClick={onToggle}
          disabled={saving}
          className={`grid size-6 place-items-center rounded-md border-2 transition-colors ${
            task.completed ? 'border-ink bg-ink text-sheet' : 'border-ink-soft/60 text-transparent hover:border-ink'
          }`}
        >
          <CheckIcon />
        </button>
      </div>

      <div className="flex min-w-0 items-start gap-2 py-3.5 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              maxLength={MAX_TITLE}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              aria-label="Editar tarea"
              className="w-full border-b-2 border-ink bg-transparent text-lg leading-snug outline-none focus-visible:outline-none"
            />
          ) : (
            <p onDoubleClick={startEdit} className="text-lg leading-snug break-words">
              <span
                className={`strike transition-colors ${task.completed ? 'text-ink-soft' : ''}`}
                data-on={task.completed}
              >
                {task.title}
              </span>
            </p>
          )}
          <p className="mt-1 font-mono text-[11px] tracking-wide text-ink-soft">
            {saving ? (
              'guardando…'
            ) : (
              <time dateTime={task.createdAt} title={fullDate(task.createdAt)}>
                {relativeTime(task.createdAt, now)}
              </time>
            )}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
          <button type="button" onClick={startEdit} disabled={saving} aria-label={`Editar "${task.title}"`} className={iconButton}>
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            aria-label={`Eliminar "${task.title}"`}
            className={`${iconButton} hover:text-margin`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </li>
  )
}

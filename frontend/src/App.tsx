import { useEffect, useMemo, useState } from 'react'
import { API_URL, type Task, type TaskPatch } from './api'
import { MoonIcon, SunIcon } from './components/Icons'
import { Message, SkeletonRows } from './components/States'
import { TaskComposer } from './components/TaskComposer'
import { TaskItem } from './components/TaskItem'
import { Toasts } from './components/Toasts'
import { isTemp, useTasks } from './hooks/useTasks'
import { useTheme } from './hooks/useTheme'
import { useToasts } from './hooks/useToasts'
import { todayLabel } from './lib/time'

type Filter = 'all' | 'pending' | 'done'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'done', label: 'Completadas' },
]

const EMPTY: Record<Filter, { title: string; hint: string }> = {
  all: { title: 'La página está en blanco.', hint: 'Escribe tu primera tarea en la línea de arriba.' },
  pending: { title: 'Nada pendiente.', hint: 'Añade una tarea arriba o revisa las completadas.' },
  done: { title: 'Aún no has tachado nada.', hint: 'Marca la casilla de una tarea para completarla.' },
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function App() {
  const { tasks, load, refresh, add, update, remove, clearCompleted } = useTasks()
  const { toasts, push, dismiss } = useToasts()
  const { theme, toggle } = useTheme()
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(Date.now())

  // Refresca las fechas relativas ("hace 5 minutos") cada minuto
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const pending = tasks.filter((t) => !t.completed).length
  const done = tasks.length - pending
  const visible = useMemo(
    () => tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed)),
    [tasks, filter],
  )

  async function track(id: string, action: () => Promise<void>) {
    setSaving((s) => new Set(s).add(id))
    try {
      await action()
    } finally {
      setSaving((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const fail = (verb: string) => (e: unknown) => push('error', `No se pudo ${verb}: ${(e as Error).message}`)

  const handleAdd = (title: string) => add(title).catch((e) => {
    fail('añadir la tarea')(e)
    throw e
  })

  const handleUpdate = (task: Task, patch: TaskPatch, verb: string) =>
    track(task.id, () => update(task.id, patch)).catch(fail(verb))

  const handleDelete = (task: Task) =>
    track(task.id, () => remove(task.id))
      .then(() => push('success', `Tarea eliminada: «${task.title}»`))
      .catch(fail('eliminar la tarea'))

  async function handleClearCompleted() {
    const { deleted, failed } = await clearCompleted()
    if (deleted) push('success', `${plural(deleted, 'tarea completada eliminada', 'tareas completadas eliminadas')}`)
    if (failed) push('error', `No se pudieron eliminar ${plural(failed, 'tarea', 'tareas')}. Inténtalo de nuevo.`)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-24 pt-8 sm:px-6 sm:pt-14">
      <header className="mb-8 sm:mb-10">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">{todayLabel()}</p>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-rule/60 hover:text-ink"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <h1 className="mt-3 font-display text-6xl font-extrabold leading-none tracking-tight sm:text-8xl">Tareas</h1>
        <p className="mt-4 text-lg italic text-ink-soft" aria-live="polite">
          {load.status !== 'ready'
            ? 'Abriendo la libreta…'
            : tasks.length === 0
              ? 'Sin tareas por ahora.'
              : pending === 0
                ? `Todo hecho. ${plural(done, 'tarea tachada', 'tareas tachadas')}.`
                : `Te ${pending === 1 ? 'queda' : 'quedan'} ${plural(pending, 'pendiente', 'pendientes')} de ${tasks.length}.`}
        </p>
      </header>

      {!API_URL && (
        <div role="alert" className="mb-6 rounded-lg border-2 border-margin/60 px-4 py-3 text-sm">
          Falta la URL de la API. Define <code className="font-mono">VITE_API_URL</code> en{' '}
          <code className="font-mono">frontend/.env.local</code> (valor de{' '}
          <code className="font-mono">terraform output api_url</code>) y reinicia el servidor.
        </div>
      )}

      <nav className="mb-3 flex flex-wrap items-center justify-between gap-2" aria-label="Filtrar tareas">
        <div className="flex gap-1" role="tablist">
          {FILTERS.map((f) => {
            const count = f.id === 'all' ? tasks.length : f.id === 'done' ? done : pending
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-ink text-sheet' : 'text-ink-soft hover:bg-rule/60 hover:text-ink'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 font-mono text-[11px] ${active ? 'text-sheet/70' : 'text-ink-soft/80'}`}>{count}</span>
              </button>
            )
          })}
        </div>
        {done > 0 && (
          <button
            type="button"
            onClick={handleClearCompleted}
            className="rounded-full px-3 py-1.5 text-sm text-ink-soft underline decoration-margin/60 underline-offset-4 transition-colors hover:text-margin"
          >
            Borrar completadas
          </button>
        )}
      </nav>

      <main className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[0_1px_0_var(--rule),0_12px_32px_-18px_rgb(27_42_74/0.35)]">
        <TaskComposer onAdd={handleAdd} />

        {load.status === 'loading' && tasks.length === 0 ? (
          <SkeletonRows />
        ) : load.status === 'error' ? (
          <Message title="No se pudo abrir la lista.">
            <p>{load.message}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 rounded-full bg-ink px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-sheet"
            >
              Reintentar
            </button>
          </Message>
        ) : visible.length === 0 ? (
          <Message title={EMPTY[filter].title}>{EMPTY[filter].hint}</Message>
        ) : (
          <ul aria-label="Lista de tareas">
            {visible.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                now={now}
                saving={isTemp(task) || saving.has(task.id)}
                onToggle={() =>
                  handleUpdate(task, { completed: !task.completed }, task.completed ? 'reabrir la tarea' : 'completar la tarea')
                }
                onRename={(title) => handleUpdate(task, { title }, 'renombrar la tarea')}
                onDelete={() => handleDelete(task)}
              />
            ))}
          </ul>
        )}
      </main>

      <footer className="mt-auto pt-10 text-center font-mono text-[11px] text-ink-soft">
        Doble clic sobre una tarea para editarla · Lambda + DynamoDB
        {API_URL && <span className="block pt-1 opacity-70">{API_URL.replace(/^https?:\/\//, '')}</span>}
      </footer>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

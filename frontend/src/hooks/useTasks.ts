import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { Task, TaskPatch } from '../api'

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

const TEMP_PREFIX = 'tmp-'
export const isTemp = (task: Task) => task.id.startsWith(TEMP_PREFIX)

const newestFirst = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt)

/**
 * Estado de la lista con actualizaciones optimistas: la UI cambia al instante
 * y, si la API falla, se revierte y se relanza el error para que la vista avise.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const refresh = useCallback(async () => {
    setLoad({ status: 'loading' })
    try {
      setTasks(await api.listTasks())
      setLoad({ status: 'ready' })
    } catch (e) {
      setLoad({ status: 'error', message: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback(async (title: string) => {
    const now = new Date().toISOString()
    const temp: Task = { id: TEMP_PREFIX + crypto.randomUUID(), title, completed: false, createdAt: now, updatedAt: now }
    setTasks((ts) => [temp, ...ts])
    try {
      const created = await api.createTask(title)
      setTasks((ts) => ts.map((t) => (t.id === temp.id ? created : t)))
    } catch (e) {
      setTasks((ts) => ts.filter((t) => t.id !== temp.id))
      throw e
    }
  }, [])

  const update = useCallback(async (id: string, patch: TaskPatch) => {
    const before = tasksRef.current.find((t) => t.id === id)
    if (!before) return
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      const saved = await api.updateTask(id, patch)
      setTasks((ts) => ts.map((t) => (t.id === id ? saved : t)))
    } catch (e) {
      setTasks((ts) => ts.map((t) => (t.id === id ? before : t)))
      throw e
    }
  }, [])

  const restore = (removed: Task[]) =>
    setTasks((ts) => [...ts, ...removed.filter((r) => !ts.some((t) => t.id === r.id))].sort(newestFirst))

  const remove = useCallback(async (id: string) => {
    const before = tasksRef.current.find((t) => t.id === id)
    if (!before) return
    setTasks((ts) => ts.filter((t) => t.id !== id))
    try {
      await api.deleteTask(id)
    } catch (e) {
      restore([before])
      throw e
    }
  }, [])

  /** Borra todas las completadas; devuelve cuántas se borraron y cuántas fallaron. */
  const clearCompleted = useCallback(async () => {
    const done = tasksRef.current.filter((t) => t.completed && !isTemp(t))
    setTasks((ts) => ts.filter((t) => !done.includes(t)))
    const results = await Promise.allSettled(done.map((t) => api.deleteTask(t.id)))
    const failed = done.filter((_, i) => results[i].status === 'rejected')
    if (failed.length) restore(failed)
    return { deleted: done.length - failed.length, failed: failed.length }
  }, [])

  return { tasks, load, refresh, add, update, remove, clearCompleted }
}

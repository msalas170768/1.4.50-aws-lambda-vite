export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'completed'>>

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError('Falta configurar VITE_API_URL', 0)

  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('No se pudo conectar con la API. Comprueba tu conexión.', 0)
  }

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error ?? `La API respondió ${res.status}`, res.status)
  return data as T
}

export const listTasks = () => request<Task[]>('/tasks')
export const createTask = (title: string) => request<Task>('/tasks', 'POST', { title })
export const updateTask = (id: string, patch: TaskPatch) =>
  request<Task>(`/tasks/${encodeURIComponent(id)}`, 'PUT', patch)
export const deleteTask = (id: string) =>
  request<void>(`/tasks/${encodeURIComponent(id)}`, 'DELETE')

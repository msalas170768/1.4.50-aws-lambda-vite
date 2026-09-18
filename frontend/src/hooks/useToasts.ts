import { useCallback, useState } from 'react'

export type Toast = { id: number; kind: 'success' | 'error'; text: string }

let nextId = 1

export function useToasts(timeout = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: Toast['kind'], text: string) => {
      const id = nextId++
      setToasts((ts) => [...ts.slice(-2), { id, kind, text }])
      window.setTimeout(() => dismiss(id), timeout)
    },
    [dismiss, timeout],
  )

  return { toasts, push, dismiss }
}

import type { ReactNode } from 'react'

export function SkeletonRows() {
  return (
    <ul aria-label="Cargando tareas" aria-busy="true">
      {[70, 45, 60].map((w) => (
        <li key={w} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-rule last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)]">
          <div className="flex justify-center border-r-2 border-margin/70 pt-4">
            <div className="size-6 rounded-md bg-rule motion-safe:animate-pulse" />
          </div>
          <div className="space-y-2 py-4 pl-4">
            <div className="h-4 rounded bg-rule motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-16 rounded bg-rule/70 motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[4rem_minmax(0,1fr)]">
      <div className="border-r-2 border-margin/70" />
      <div className="px-4 py-10 sm:py-14">
        <p className="font-display text-2xl italic">{title}</p>
        {children && <div className="mt-2 text-ink-soft">{children}</div>}
      </div>
    </div>
  )
}

import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const CheckIcon = () => (
  <svg {...base} width={14} height={14} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

export const PencilIcon = () => (
  <svg {...base}>
    <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
)

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
)

export const PlusIcon = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const MoonIcon = () => (
  <svg {...base}>
    <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
  </svg>
)

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

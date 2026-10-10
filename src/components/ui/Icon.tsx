import type { ReactNode } from "react"
import type { IconName } from "../../types/workbench"

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className = "" }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    aegis: (
      <>
        <path d="M12 2.8 4.5 6v5.4c0 4.8 3.1 8.8 7.5 10.2 4.4-1.4 7.5-5.4 7.5-10.2V6L12 2.8Z" />
        <path d="m9 13.5 3-6 3 6M10.3 11h3.4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
        <path d="M10 21h4" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M6 7v10M8 17c5 0 8-3 8-8V8" />
      </>
    ),
    check: <path d="m5 13 4 4L19 7" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    code: <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="1.5" />
        <path d="M16 8V5H5v11h3" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </>
    ),
    explorer: (
      <>
        <path d="M5 3h9l5 5v13H5z" />
        <path d="M14 3v5h5M9 13h6M9 17h5" />
      </>
    ),
    file: (
      <>
        <path d="M6 2.8h8l4 4V21H6z" />
        <path d="M14 3v4h4" />
      </>
    ),
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    git: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="12" r="2" />
        <path d="M6 7v10m2-6c4 0 6 1 8 1" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </>
    ),
    layout: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M8 4v16m9-16v16" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 14h18" />
      </>
    ),
    play: <path d="m9 6 9 6-9 6z" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    split: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M12 4v16" />
      </>
    ),
    terminal: <path d="m5 7 5 5-5 5m8 0h6" />,
    trash: (
      <>
        <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        {paths[name]}
      </g>
    </svg>
  )
}

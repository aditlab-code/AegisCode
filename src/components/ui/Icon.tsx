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
    "arrow-down": <path d="M12 5v14m-6-6 6 6 6-6" />,
    "arrow-up": <path d="M12 19V5m-6 6 6-6 6 6" />,
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
    "chevron-up": <path d="m18 15-6-6-6 6" />,
    "collapse-all": (
      <>
        <path d="M4 5h16" />
        <path d="m18 16-6-6-6 6" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    "close-all": (
      <>
        <path d="M7 4h12a2 2 0 0 1 2 2v10" />
        <rect x="3" y="8" width="14" height="12" rx="1.5" />
        <path d="m7 12 6 6m0-6-6 6" />
      </>
    ),
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
    maximize: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
    moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
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
    refresh: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
      </>
    ),
    "replace-all": (
      <>
        <path d="M4 14h10l-3-3m3 3-3 3" />
        <path d="M20 10H10l3-3m-3 3 3 3" />
      </>
    ),
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
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m14.14-14.14-1.41 1.41" />
      </>
    ),
    symbol: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
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
    edit: (
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    ),
    add: <path d="M12 5v14M5 12h14" />,
    cloud: (
      <>
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        <path d="m12 13 3-3m-3 3-3-3m3 3V8" />
      </>
    ),
    sparkle: (
      <path d="m12 3 1.9 4.9L19 9.8l-4.1 3.5 1.2 5.2L12 16l-4.1 2.5 1.2-5.2L5 9.8l5.1-1.9L12 3z" />
    ),
    tag: (
      <>
        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
        <path d="M7 7h.01" />
      </>
    ),
    discard: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    brain: (
      <>
        <path d="M12 4.5a3.5 3.5 0 0 0-3.5 3.5c0 .4.08.78.22 1.13A3 3 0 0 0 7 12a3 3 0 0 0 .5 1.66A3.5 3.5 0 0 0 9 20h3m0-15.5a3.5 3.5 0 0 1 3.5 3.5c0 .4-.08.78-.22 1.13A3 3 0 0 1 17 12a3 3 0 0 1-.5 1.66A3.5 3.5 0 0 1 15 20h-3M12 4.5v15.5" />
      </>
    ),
    debug: (
      <>
        <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1" />
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
        <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.6-3.8 3.53-4M20.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M21 21c0-2.1-1.6-3.8-3.53-4" />
      </>
    ),
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </>
    ),
    "step-over": (
      <>
        <path d="M7 16V8a5 5 0 0 1 10 0v8" />
        <path d="m14 13 3 3 3-3" />
        <circle cx="7" cy="18" r="1.5" />
      </>
    ),
    "step-into": (
      <>
        <path d="M12 4v12m-4-4 4 4 4-4" />
        <circle cx="12" cy="20" r="1.5" />
      </>
    ),
    "step-out": (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4" />
        <circle cx="12" cy="20" r="1.5" />
      </>
    ),
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    "zoom-in": (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4m-5-7v6m-3-3h6" />
      </>
    ),
    "zoom-out": (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4m-8-5h6" />
      </>
    ),
    "fit-screen": (
      <>
        <path d="M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    bold: (
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6Zm0 8h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6Z" />
    ),
    italic: <path d="M19 4h-9m4 16H5m9-16L10 20" />,
    heading: <path d="M6 4v16M18 4v16M6 12h12" />,
    list: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "wrap-text": (
      <>
        <path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M3 18h7" />
      </>
    ),
    "sidebar-left": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
      </>
    ),
    "sidebar-right": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </>
    ),
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    stash: (
      <>
        <rect x="3" y="4" width="18" height="5" rx="1" />
        <path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
        <path d="M10 13h4" />
      </>
    ),
    "cherry-pick": (
      <>
        <circle cx="7" cy="18" r="3" />
        <circle cx="17" cy="6" r="3" />
        <path d="M7 15V9a3 3 0 0 1 3-3h4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
    unlock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0" />
      </>
    ),
    shield: (
      <path d="M12 2.8 4.5 6v5.4c0 4.8 3.1 8.8 7.5 10.2 4.4-1.4 7.5-5.4 7.5-10.2V6L12 2.8Z" />
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

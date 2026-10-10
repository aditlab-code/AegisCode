import type { ReactNode } from "react"

interface IconButtonProps {
  active?: boolean
  children: ReactNode
  label: string
  onClick?: () => void
  className?: string
}

export function IconButton({
  active = false,
  children,
  label,
  onClick,
  className = "",
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${
        active ? "icon-button-active" : ""
      } ${className}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

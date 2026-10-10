import { Icon } from "./Icon"
import { IconButton } from "./IconButton"

interface ToastProps {
  message: string
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: ToastProps) {
  if (!message) return null

  return (
    <div className="action-toast" role="status">
      <span className="status-dot" />
      <span>{message}</span>
      <IconButton label="Dismiss notification" onClick={onDismiss}>
        <Icon name="close" size={13} />
      </IconButton>
    </div>
  )
}

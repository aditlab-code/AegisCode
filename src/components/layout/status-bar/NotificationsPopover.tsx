import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"

interface NotificationsPopoverProps {
  onClose?: () => void
}

export function NotificationsPopover({ onClose }: NotificationsPopoverProps) {
  const {
    notifications,
    markAllNotificationsRead,
    markNotificationRead,
    clearAllNotifications,
    removeNotification,
  } = useWorkbenchStore(
    useShallow((s) => ({
      notifications: s.notifications,
      markAllNotificationsRead: s.markAllNotificationsRead,
      markNotificationRead: s.markNotificationRead,
      clearAllNotifications: s.clearAllNotifications,
      removeNotification: s.removeNotification,
    })),
  )

  return (
    <div className="status-popover notification-popover">
      <div className="status-popover-header">
        <span>NOTIFICATIONS</span>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <>
              <button onClick={markAllNotificationsRead} type="button">
                Mark all read
              </button>
              <button onClick={clearAllNotifications} type="button">
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty">
          <Icon name="bell" size={24} />
          <span>No notifications</span>
          <small>You're all caught up</small>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((item) => (
            <div
              className={`notification-item ${
                !item.read ? "notification-unread" : ""
              }`}
              key={item.id}
              onClick={() => markNotificationRead(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  markNotificationRead(item.id)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="notification-state" />
              <div className="notification-content">
                <strong>{item.title}</strong>
                {item.detail && <small>{item.detail}</small>}
              </div>
              <time>{item.time}</time>
              <button
                className="notification-dismiss"
                onClick={(e) => {
                  e.stopPropagation()
                  removeNotification(item.id)
                }}
                title="Dismiss notification"
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="notification-footer">
        {notifications.length === 0
          ? "No workspace events"
          : `${notifications.length} notification${
              notifications.length === 1 ? "" : "s"
            }`}
      </div>
    </div>
  )
}

import { useWorkbench } from "../../../context/WorkbenchContext"

export function NotificationsPopover() {
  const { notifications, markAllNotificationsRead, markNotificationRead } =
    useWorkbench()

  return (
    <div className="status-popover notification-popover">
      <div className="status-popover-header">
        <span>NOTIFICATIONS</span>
        <button onClick={markAllNotificationsRead} type="button">
          Mark all read
        </button>
      </div>
      {notifications.map((item) => (
        <button
          className={!item.read ? "notification-unread" : ""}
          key={item.id}
          onClick={() => markNotificationRead(item.id)}
          type="button"
        >
          <span className="notification-state" />
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          <time>{item.time}</time>
        </button>
      ))}
      <div className="notification-footer">Local workspace events only</div>
    </div>
  )
}

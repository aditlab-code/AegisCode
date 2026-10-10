import { useWorkbench } from "../../../context/WorkbenchContext"
import { Icon } from "../../ui/Icon"

export function ChatSessionSidebar() {
  const { sessions, activeSessionId, switchSession, deleteSession } =
    useWorkbench()

  return (
    <div className="chat-sessions-sidebar">
      <div className="sessions-sidebar-header">
        <div className="sessions-sidebar-title">
          <Icon name="history" size={13} />
          <span>Sessions</span>
          <span className="session-count-badge">{sessions.length}</span>
        </div>
      </div>

      <div className="sessions-sidebar-list">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const providerTag =
            session.provider === "antigravity"
              ? "AGY"
              : session.provider === "opencode"
                ? "OC"
                : "OR"

          return (
            <div
              key={session.id}
              className={`session-sidebar-card ${isActive ? "active" : ""}`}
              onClick={() => switchSession(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  switchSession(session.id)
                }
              }}
            >
              <div className="session-sidebar-card-content">
                <div className="session-sidebar-title-row">
                  <span
                    className="session-sidebar-card-title"
                    title={session.title}
                  >
                    {session.title}
                  </span>
                  {isActive && <span className="session-sidebar-active-dot" />}
                </div>

                <div className="session-sidebar-meta">
                  <span className={`session-card-tag tag-${session.provider}`}>
                    {providerTag}
                  </span>
                  <span>{session.messages.length} msg</span>
                </div>
              </div>

              <button
                type="button"
                className="session-sidebar-delete-btn"
                title="Delete session"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteSession(session.id)
                }}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

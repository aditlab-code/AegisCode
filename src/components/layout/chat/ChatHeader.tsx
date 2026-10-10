import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function ChatHeader() {
  const {
    setChatOpen,
    activeSession,
    createSession,
    chatSessionsOpen,
    toggleChatSessions,
  } = useWorkbench()

  return (
    <div className="chat-header">
      <div className="chat-heading">
        <span className="agent-mark">
          <Icon name="aegis" size={17} />
        </span>
        <div className="chat-heading-info">
          <strong>AEGIS</strong>
          <span
            className="chat-active-session-label"
            title={activeSession.title}
          >
            {activeSession.title}
          </span>
        </div>
      </div>

      <div className="chat-header-actions">
        <IconButton
          label="New chat session"
          onClick={() => createSession()}
        >
          <Icon name="plus" size={14} />
        </IconButton>
        <IconButton
          label={chatSessionsOpen ? "Hide chat sessions" : "Show chat sessions"}
          onClick={toggleChatSessions}
          className={chatSessionsOpen ? "active" : ""}
        >
          <Icon name="history" size={14} />
        </IconButton>
        <IconButton
          label="Close AEGIS chat"
          onClick={() => setChatOpen(false)}
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>
    </div>
  )
}

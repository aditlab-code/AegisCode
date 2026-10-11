import { useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { CHAT_PROVIDERS } from "../../../data/chatConstants"

function renderMessageContent(text: string) {
  const lines = text.split("\n")
  return lines.map((line, lineIdx) => {
    const parts = line.split(/((?:^|\s)[/@][a-zA-Z0-9_\-./]+)/g)
    return (
      <span key={lineIdx} className="message-line">
        {parts.map((part, partIdx) => {
          const trimmed = part.trim()
          if (trimmed.startsWith("@")) {
            const isFolder = trimmed.endsWith("/")
            return (
              <span key={partIdx} className="message-token token-mention">
                <Icon name={isFolder ? "folder" : "file"} size={11} />
                <span>{trimmed}</span>
              </span>
            )
          }
          if (trimmed.startsWith("/")) {
            return (
              <span key={partIdx} className="message-token token-command">
                <Icon name="code" size={11} />
                <span>{trimmed}</span>
              </span>
            )
          }
          return part
        })}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    )
  })
}

export function ChatMessageList() {
  const { chatMessages, activeProvider, activeModel, showToast } =
    useWorkbench()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const providerObj =
    CHAT_PROVIDERS.find((p) => p.id === activeProvider) || CHAT_PROVIDERS[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  function handleCopy(text: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text)
      showToast("Message copied to clipboard")
    }
  }

  return (
    <div className="messages">
      {chatMessages.length === 0 ? (
        <div className="messages-empty-state">
          <span className="empty-state-icon">
            <Icon name="aegis" size={24} />
          </span>
          <p>Ask AEGIS anything about your workspace.</p>
          <span className="empty-state-hint">
            Type / for skills, @ for files
          </span>
        </div>
      ) : (
        chatMessages.map((item) => (
          <div className={`message-card message-${item.role}`} key={item.id}>
            <div className="message-header">
              <div className="message-author-info">
                <span className={`msg-avatar msg-avatar-${item.role}`}>
                  {item.role === "agent" ? (
                    <Icon name="aegis" size={11} />
                  ) : (
                    <span>U</span>
                  )}
                </span>
                <strong className="msg-author-name">
                  {item.role === "agent" ? "AEGIS" : "You"}
                </strong>
                {item.role === "agent" && (
                  <div className="flex items-center gap-1">
                    <span className={`provider-tag tag-${activeProvider}`}>
                      {providerObj.tag}
                    </span>
                    <span className="msg-model-badge">{activeModel}</span>
                  </div>
                )}
              </div>

              {item.role === "agent" && (
                <button
                  type="button"
                  className="msg-copy-btn"
                  title="Copy message"
                  onClick={() => handleCopy(item.text)}
                >
                  <Icon name="copy" size={12} />
                </button>
              )}
            </div>

            {item.context && item.context.length > 0 && (
              <div className="message-context-banner">
                <details className="message-context-details">
                  <summary className="message-context-summary">
                    <Icon name="file" size={11} />
                    <span>
                      {item.context.length} Context Item
                      {item.context.length > 1 ? "s" : ""} (
                      {item.context
                        .map((c) => c.path.split("/").pop())
                        .join(", ")}
                      )
                    </span>
                    <span className="context-tokens-badge">
                      ~
                      {item.context.reduce(
                        (acc, c) => acc + c.estimatedTokens,
                        0,
                      )}{" "}
                      tokens
                    </span>
                  </summary>
                  <div className="message-context-content">
                    {item.context.map((c, cIdx) => (
                      <div key={cIdx} className="message-context-item">
                        <div className="context-item-header">
                          <span className="context-item-path">{c.path}</span>
                          {c.lineRange && (
                            <span className="context-item-range">
                              {c.lineRange}
                            </span>
                          )}
                          {c.isTruncated && (
                            <span className="context-item-truncated flex items-center gap-1">
                              <Icon name="warning" size={10} />
                              <span>Truncated</span>
                            </span>
                          )}
                        </div>
                        <pre className="context-item-code">
                          <code>
                            {c.content.length > 300
                              ? c.content.slice(0, 300) + "\n..."
                              : c.content}
                          </code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            <div className="message-body">
              {renderMessageContent(item.text)}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

import { useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { CHAT_PROVIDERS } from "../../../data/chatConstants"
import { MarkdownRenderer } from "./MarkdownRenderer"

export function ChatMessageList() {
  const {
    chatMessages,
    activeProvider,
    activeModel,
    showToast,
    setSettingsModalOpen,
  } = useWorkbench()
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
        chatMessages.map((item) => {
          const itemProvider = item.provider || activeProvider
          const itemModel = item.model || activeModel
          const itemProviderObj =
            CHAT_PROVIDERS.find((p) => p.id === itemProvider) || providerObj

          return (
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
                      <span className={`provider-tag tag-${itemProvider}`}>
                        {itemProviderObj.tag}
                      </span>
                      <span className="msg-model-badge">{itemModel}</span>
                    </div>
                  )}
                </div>

                {item.role === "agent" && item.text && (
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

              {/* Thinking Process Accordion */}
              {item.thinking && (
                <div className="message-thinking-block">
                  <details
                    className="thinking-details"
                    open={Boolean(item.isStreaming && !item.text)}
                  >
                    <summary className="thinking-summary">
                      <Icon
                        name="brain"
                        size={12}
                        className={
                          item.isStreaming && !item.text
                            ? "animate-pulse text-accent"
                            : ""
                        }
                      />
                      <span>Thinking Process</span>
                      {item.isStreaming && !item.text && (
                        <span className="thinking-status-indicator">
                          In progress...
                        </span>
                      )}
                    </summary>
                    <div className="thinking-body whitespace-pre-wrap">
                      {item.thinking}
                    </div>
                  </details>
                </div>
              )}

              {/* Tool Calls Action Chips */}
              {item.toolCalls && item.toolCalls.length > 0 && (
                <div className="message-tools-list">
                  {item.toolCalls.map((tc) => (
                    <details key={tc.id} className="tool-call-chip">
                      <summary className="tool-call-summary">
                        <span
                          className={`tool-call-status status-${tc.status}`}
                        >
                          <Icon
                            name={
                              tc.status === "running"
                                ? "refresh"
                                : tc.status === "error"
                                  ? "error"
                                  : "check"
                            }
                            size={11}
                            className={
                              tc.status === "running" ? "animate-spin" : ""
                            }
                          />
                        </span>
                        <span className="tool-call-name">{tc.name}</span>
                        {tc.summary && (
                          <span className="tool-call-desc">{tc.summary}</span>
                        )}
                      </summary>
                      <div className="tool-call-details">
                        {tc.args && (
                          <pre className="tool-call-args">
                            <code>{JSON.stringify(tc.args, null, 2)}</code>
                          </pre>
                        )}
                        {tc.output && (
                          <pre className="tool-call-output">
                            <code>{tc.output}</code>
                          </pre>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Error Message Card */}
              {item.error && (
                <div className="chat-error-card">
                  <div className="chat-error-header">
                    <Icon name="warning" size={13} />
                    <span className="font-semibold text-xs">
                      AI Execution Notice
                    </span>
                  </div>
                  <p className="chat-error-message">{item.error}</p>
                  <div className="chat-error-actions">
                    <button
                      type="button"
                      className="chat-error-btn"
                      onClick={() => setSettingsModalOpen(true)}
                    >
                      <Icon name="settings" size={11} />
                      <span>Open Settings</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Message Body or Streaming Placeholder */}
              {item.text ? (
                <div className="message-body">
                  <MarkdownRenderer
                    text={item.text}
                    isStreaming={item.isStreaming}
                  />
                  {item.isStreaming && <span className="streaming-cursor" />}
                </div>
              ) : item.isStreaming ? (
                <div className="message-body-streaming-shimmer">
                  <span className="shimmer-dot" />
                  <span className="shimmer-dot" />
                  <span className="shimmer-dot" />
                </div>
              ) : item.role === "agent" &&
                !item.error &&
                !item.thinking &&
                (!item.toolCalls || item.toolCalls.length === 0) ? (
                <div className="message-body text-ink-muted text-xs italic">
                  Sedang menunggu respons...
                </div>
              ) : null}
            </div>
          )
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

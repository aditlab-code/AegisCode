import { useEffect, useRef, useCallback, memo, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { CHAT_PROVIDERS } from "../../../data/chatConstants"
import { MarkdownRenderer } from "./MarkdownRenderer"
import { ToolCallActivityCard, ToolCallStepper } from "./ToolCallActivity"
import { normalizeWorkspacePath } from "../../../utils/workspaceApi"
import type { ChatMessage } from "../../../types/workbench"

export interface ProposedFileChange {
  targetPath: string
  code: string
}

/**
 * Extracts proposed code blocks that specify target filepaths (e.g. ```ts:src/utils.ts)
 */
export function extractProposedCodeBlocks(text: string): ProposedFileChange[] {
  if (!text) return []
  const results: ProposedFileChange[] = []
  const lines = text.split("\n")
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = line.match(/^```(?:[a-zA-Z0-9_.-]+:(\S+))/)
    if (fenceMatch) {
      const targetPath = fenceMatch[1]
      const codeLines: string[] = []
      i++
      while (i < lines.length) {
        if (lines[i].startsWith("```")) {
          i++
          break
        }
        codeLines.push(lines[i])
        i++
      }
      results.push({
        targetPath,
        code: codeLines.join("\n"),
      })
      continue
    }
    i++
  }

  return results
}

interface ChatMessageCardProps {
  item: ChatMessage
  activeProvider: string
  activeModel: string
  onCopy: (text: string) => void
  onOpenSettings: () => void
  onReviewInGit: () => void
  onApplyAll: (blocks: ProposedFileChange[]) => void
  onOpenFile: (path: string) => void
}

const ChatMessageCard = memo(function ChatMessageCard({
  item,
  activeProvider,
  activeModel,
  onCopy,
  onOpenSettings,
  onReviewInGit,
  onApplyAll,
  onOpenFile,
}: ChatMessageCardProps) {
  const itemProvider = item.provider || activeProvider
  const itemModel = item.model || activeModel
  const itemProviderObj =
    CHAT_PROVIDERS.find((p) => p.id === itemProvider) || CHAT_PROVIDERS[0]

  // Identify files touched by tools (memoized)
  const toolModifiedFiles = useMemo(() => {
    return (item.toolCalls || [])
      .filter(
        (tc) =>
          tc.name === "write_to_file" ||
          tc.name === "replace_file_content" ||
          tc.name === "create_file" ||
          tc.name === "delete_file" ||
          tc.name === "edit_file",
      )
      .map((tc) => {
        const raw = (tc.args?.TargetFile ||
          tc.args?.targetFile ||
          tc.args?.path ||
          tc.args?.target ||
          "") as string
        return raw.replace(/^\/+/, "")
      })
      .filter(Boolean)
  }, [item.toolCalls])

  // Identify code blocks proposing changes to files (skip during active streaming)
  const proposedBlocks = useMemo(() => {
    if (item.role !== "agent" || !item.text || item.isStreaming) return []
    return extractProposedCodeBlocks(item.text)
  }, [item.role, item.text, item.isStreaming])

  const allTouchedFiles = useMemo(() => {
    return Array.from(
      new Set([
        ...toolModifiedFiles,
        ...proposedBlocks.map((b) => b.targetPath),
      ]),
    )
  }, [toolModifiedFiles, proposedBlocks])

  return (
    <div className={`message-card message-${item.role}`}>
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
            onClick={() => onCopy(item.text)}
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
                {item.context.map((c) => c.path.split("/").pop()).join(", ")})
              </span>
              <span className="context-tokens-badge">
                ~{item.context.reduce((acc, c) => acc + c.estimatedTokens, 0)}{" "}
                tokens
              </span>
            </summary>
            <div className="message-context-content">
              {item.context.map((c, cIdx) => (
                <div key={cIdx} className="message-context-item">
                  <div className="context-item-header">
                    <span className="context-item-path">{c.path}</span>
                    {c.lineRange && (
                      <span className="context-item-range">{c.lineRange}</span>
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
              {item.isStreaming && item.thinking.length > 3000
                ? "... [earlier thinking hidden during stream]\n\n" +
                  item.thinking.slice(-3000)
                : item.thinking}
            </div>
          </details>
        </div>
      )}

      {/* Tool Calls Activity Feed (Single or Stepper) */}
      {item.toolCalls && item.toolCalls.length > 0 && (
        <div className="message-tools-list">
          <ToolCallStepper toolCalls={item.toolCalls} onOpenFile={onOpenFile} />
        </div>
      )}

      {/* Message Body or Streaming Placeholder */}
      {item.text ? (
        <div className="message-body">
          <MarkdownRenderer text={item.text} isStreaming={item.isStreaming} />
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

      {/* Error Message Card (Preserves Partial Text Above) */}
      {item.error && (
        <div className="chat-error-card">
          <div className="chat-error-header">
            <Icon name="warning" size={13} />
            <span className="font-semibold text-xs">AI Execution Notice</span>
          </div>
          <p className="chat-error-message">{item.error}</p>
          <div className="chat-error-actions">
            <button
              type="button"
              className="chat-error-btn"
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={11} />
              <span>Open Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Agent Multi-File Review Banner */}
      {allTouchedFiles.length > 0 && (
        <div className="mt-2.5 p-2.5 rounded bg-surface-raised border border-line flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-accent shrink-0">
                <Icon name="git" size={13} />
              </span>
              <span className="text-ink text-[11px] font-medium truncate">
                {toolModifiedFiles.length > 0
                  ? "Modified"
                  : "Proposed changes to"}{" "}
                {allTouchedFiles.length} file
                {allTouchedFiles.length > 1 ? "s" : ""}:
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {proposedBlocks.length > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-accent-fg hover:opacity-90 transition-opacity text-[11px] font-medium cursor-pointer"
                  onClick={() => onApplyAll(proposedBlocks)}
                  title="Apply all proposed file changes to workspace"
                >
                  <Icon name="check" size={10} />
                  <span>Apply All ({proposedBlocks.length})</span>
                </button>
              )}
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-line text-ink hover:bg-surface-hover transition-colors text-[11px] font-medium cursor-pointer"
                onClick={onReviewInGit}
                title="Open Source Control to review side-by-side diffs"
              >
                <span>Review in Git</span>
                <Icon name="chevron" size={9} />
              </button>
            </div>
          </div>

          {/* File Pills List */}
          <div className="flex flex-wrap items-center gap-1.5">
            {allTouchedFiles.map((file) => {
              const baseName = file.split("/").filter(Boolean).pop() || file
              return (
                <button
                  key={file}
                  type="button"
                  onClick={() => onOpenFile(file)}
                  className="px-1.5 py-0.5 rounded bg-canvas border border-line text-[10.5px] font-mono text-ink-soft hover:text-ink hover:border-accent transition-colors cursor-pointer"
                  title={`Click to open ${file}`}
                >
                  {baseName}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

export function ChatMessageList() {
  const {
    chatMessages,
    activeProvider,
    activeModel,
    showToast,
    setSettingsModalOpen,
    setActiveActivity,
    setSidebarOpen,
    openFileInPane,
    applyCodeWithReview,
    rootWorkspacePath,
  } = useWorkbench()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)

  const isStreamingAny = chatMessages.some((m) => m.isStreaming)

  // Throttled scrolling with instant auto-scroll during streaming to eliminate layout thrashing
  useEffect(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current)
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: isStreamingAny ? "auto" : "smooth",
      })
    })
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [chatMessages, isStreamingAny])

  const handleCopy = useCallback(
    (text: string) => {
      if (navigator?.clipboard) {
        navigator.clipboard.writeText(text)
        showToast("Message copied to clipboard")
      }
    },
    [showToast],
  )

  const handleOpenSettings = useCallback(() => {
    setSettingsModalOpen(true)
  }, [setSettingsModalOpen])

  const handleReviewInGit = useCallback(() => {
    setActiveActivity("Source Control")
    setSidebarOpen(true)
  }, [setActiveActivity, setSidebarOpen])

  const handleOpenFile = useCallback(
    (path: string) => {
      const clean = normalizeWorkspacePath(path, rootWorkspacePath)
      openFileInPane(clean || path)
    },
    [openFileInPane, rootWorkspacePath],
  )

  const handleApplyAll = useCallback(
    async (blocks: ProposedFileChange[]) => {
      try {
        for (const block of blocks) {
          await applyCodeWithReview(block.targetPath, block.code)
        }
        showToast(`Applied changes to ${blocks.length} file(s)`)
      } catch (err) {
        showToast(
          `Failed to apply changes: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    },
    [applyCodeWithReview, showToast],
  )

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
          <ChatMessageCard
            key={item.id}
            item={item}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onCopy={handleCopy}
            onOpenSettings={handleOpenSettings}
            onReviewInGit={handleReviewInGit}
            onApplyAll={handleApplyAll}
            onOpenFile={handleOpenFile}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

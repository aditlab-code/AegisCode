import { useEffect, useRef, useCallback, memo, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { CHAT_PROVIDERS } from "../../../data/chatConstants"
import { MarkdownRenderer } from "./MarkdownRenderer"
import { UnifiedActivityTimeline } from "./ToolCallActivity"
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
  onCopy: (text: string) => void
  onOpenSettings: () => void
  onReviewInGit: () => void
  onApplyAll: (blocks: ProposedFileChange[]) => void
  onOpenFile: (path: string) => void
}

const ChatMessageCard = memo(function ChatMessageCard({
  item,
  activeProvider,
  onCopy,
  onOpenSettings,
  onReviewInGit,
  onApplyAll,
  onOpenFile,
}: ChatMessageCardProps) {
  const itemProvider = item.provider || activeProvider
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
        const raw = (tc.targetFile ||
          tc.args?.TargetFile ||
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

  // 1. User Message: Framed minimal prompt card with inline context pills
  if (item.role === "user") {
    return (
      <div className="message-turn message-turn-user">
        <div className="user-prompt-card">
          <div className="user-prompt-text">{item.text}</div>

          {item.context && item.context.length > 0 && (
            <div className="user-context-pills">
              {item.context.map((c, cIdx) => {
                const isFolder = c.type === "folder"
                return (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => onOpenFile(c.path)}
                    className="context-pill"
                    title={
                      isFolder
                        ? `Directory: ${c.path}`
                        : `Open ${c.path}${
                            c.lineRange ? ` (${c.lineRange})` : ""
                          }`
                    }
                  >
                    <Icon name={isFolder ? "folder" : "file"} size={10} />
                    <span className="context-pill-name">
                      {c.path.split("/").pop()}
                    </span>
                    {isFolder ? (
                      <span className="context-pill-range">(Dir)</span>
                    ) : (
                      c.lineRange && (
                        <span className="context-pill-range">
                          {c.lineRange}
                        </span>
                      )
                    )}
                    {c.isTruncated && (
                      <span
                        className="context-pill-warn"
                        title="Truncated context"
                      >
                        <Icon name="warning" size={9} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 2. Agent Message: Box style balloon card with unified collapsible timeline
  return (
    <div className="message-turn message-turn-agent group relative">
      <div className="agent-response-card">
        {/* Floating hover-only action bar */}
        {item.text && (
          <div className="agent-floating-actions">
            <button
              type="button"
              className="agent-action-btn"
              title="Copy message"
              onClick={() => onCopy(item.text)}
            >
              <Icon name="copy" size={11} />
            </button>
          </div>
        )}

        {/* Unified Collapsible Activity Timeline (Thinking + Tool Calls + Error) */}
        {(item.thinking ||
          (item.toolCalls && item.toolCalls.length > 0) ||
          item.error) && (
          <UnifiedActivityTimeline
            thinking={item.thinking}
            toolCalls={item.toolCalls}
            isStreaming={item.isStreaming}
            error={item.error}
            onOpenFile={onOpenFile}
            onOpenSettings={onOpenSettings}
          />
        )}

        {/* Message Body or Streaming Placeholder */}
        {item.text ? (
          <div className="agent-body">
            <MarkdownRenderer text={item.text} isStreaming={item.isStreaming} />
          </div>
        ) : item.isStreaming ? (
          <div className="message-body-streaming-shimmer">
            <span className="shimmer-dot" />
            <span className="shimmer-dot" />
            <span className="shimmer-dot" />
          </div>
        ) : !item.error &&
          !item.thinking &&
          (!item.toolCalls || item.toolCalls.length === 0) ? (
          <div className="agent-body text-ink-muted text-xs italic">
            Waiting for response...
          </div>
        ) : null}

        {/* Multi-File Review Banner (Compact & Clean) */}
        {allTouchedFiles.length > 0 && (
          <div className="agent-files-banner">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-accent shrink-0">
                  <Icon name="git" size={12} />
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
                    className="agent-banner-apply-btn"
                    onClick={() => onApplyAll(proposedBlocks)}
                    title="Apply all proposed file changes to workspace"
                  >
                    <Icon name="check" size={10} />
                    <span>Apply All ({proposedBlocks.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  className="agent-banner-review-btn"
                  onClick={onReviewInGit}
                  title="Open Source Control to review side-by-side diffs"
                >
                  <span>Review in Git</span>
                  <Icon name="chevron" size={9} />
                </button>
              </div>
            </div>

            {/* File Pills List */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {allTouchedFiles.map((file) => {
                const baseName = file.split("/").filter(Boolean).pop() || file
                return (
                  <button
                    key={file}
                    type="button"
                    onClick={() => onOpenFile(file)}
                    className="agent-file-pill"
                    title={`Click to open ${file}`}
                  >
                    {baseName}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Subtle Micro-Metadata Footer */}
        {item.text && !item.isStreaming && (
          <div className="agent-meta-footer">
            <span
              className={`provider-tag tag-${itemProvider}`}
              title={`Provider: ${itemProviderObj.name}`}
            >
              {itemProviderObj.tag}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

export function ChatMessageList() {
  const {
    chatMessages,
    isGenerating,
    activeProvider,
    showToast,
    openSettingsTab,
    setActiveActivity,
    setSidebarOpen,
    openFileInPane,
    applyCodeWithReview,
    rootWorkspacePath,
  } = useWorkbenchStore(
    useShallow((s) => ({
      chatMessages: s.chatMessages,
      isGenerating: s.isGenerating,
      activeProvider: s.activeProvider,
      showToast: s.showToast,
      openSettingsTab: s.openSettingsTab,
      setActiveActivity: s.setActiveActivity,
      setSidebarOpen: s.setSidebarOpen,
      openFileInPane: s.openFileInPane,
      applyCodeWithReview: s.applyCodeWithReview,
      rootWorkspacePath: s.rootWorkspacePath,
    })),
  )
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
    openSettingsTab("AI")
  }, [openSettingsTab])

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

  const workspaceName = useMemo(() => {
    if (!rootWorkspacePath) return "workspace"
    const parts = rootWorkspacePath.split(/[/\\]/).filter(Boolean)
    return parts[parts.length - 1] || rootWorkspacePath
  }, [rootWorkspacePath])

  return (
    <div className="messages">
      {chatMessages.length === 0 ? (
        <div className="messages-empty-state">
          <div className="empty-state-avatar">
            <Icon name="aegis" size={24} />
          </div>
          <p className="empty-state-greeting">
            Hey there! I'm <strong>AEGIS</strong>, your copilot in{" "}
            <span
              className="empty-state-workspace-pill"
              title={rootWorkspacePath || "Current workspace"}
            >
              <Icon name="folder" size={11} />
              <span>{workspaceName}</span>
            </span>
            . What can I help you code today?
          </p>
          <div className="empty-state-hints">
            <span className="empty-hint-pill">
              <kbd className="hint-kbd">/</kbd>
              <span>skills</span>
            </span>
            <span className="empty-hint-pill">
              <kbd className="hint-kbd">@</kbd>
              <span>files</span>
            </span>
          </div>
        </div>
      ) : (
        chatMessages.map((item) => (
          <ChatMessageCard
            key={item.id}
            item={item}
            activeProvider={activeProvider}
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

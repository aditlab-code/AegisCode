import { useEffect, useRef, useState, memo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { BranchPopover } from "./BranchPopover"
import { ProblemsPopover } from "./ProblemsPopover"
import { NotificationsPopover } from "./NotificationsPopover"
import { LspStatusPopover } from "./LspStatusPopover"
import { McpStatusPopover } from "./McpStatusPopover"
import { PerfStatusPill } from "./PerfStatusPill"
import { IndexStatusPill } from "./IndexStatusPill"

const CursorStatusItem = memo(function CursorStatusItem() {
  const cursorPosition = useWorkbenchStore((s) => s.cursorPosition)
  return (
    <span className="status-item">
      Ln {cursorPosition.line}, Col {cursorPosition.col}
    </span>
  )
})

export function StatusBar() {
  const {
    isGitRepo,
    activeBranch,
    gitChanges,
    stagedChanges,
    ahead,
    behind,
    gitSync,
    diagnostics,
    notifications,
    activeLanguage,
    tabSize,
    toggleTabSize,
    encoding,
    serverConnected,
    checkServerConnection,
    showToast,
    setPanelOpen,
    setActiveBottomTab,
  } = useWorkbenchStore(
    useShallow((s) => ({
      isGitRepo: s.isGitRepo,
      activeBranch: s.activeBranch,
      gitChanges: s.gitChanges,
      stagedChanges: s.stagedChanges,
      ahead: s.ahead,
      behind: s.behind,
      gitSync: s.gitSync,
      diagnostics: s.diagnostics,
      notifications: s.notifications,
      activeLanguage: s.activeLanguage,
      tabSize: s.tabSize,
      toggleTabSize: s.toggleTabSize,
      encoding: s.encoding,
      serverConnected: s.serverConnected,
      checkServerConnection: s.checkServerConnection,
      showToast: s.showToast,
      setPanelOpen: s.setPanelOpen,
      setActiveBottomTab: s.setActiveBottomTab,
    })),
  )

  const [activePanel, setActivePanel] =
    useState<"branch" | "notifications" | "problems" | "lsp" | "mcp" | null>(
      null,
    )
  const statusBarRef = useRef<HTMLElement>(null)

  const isDirty = gitChanges.length > 0 || stagedChanges.length > 0
  const unreadCount = notifications.filter((item) => !item.read).length
  const errorCount = diagnostics.filter((d) => d.type === "error").length
  const warningCount = diagnostics.filter((d) => d.type === "warning").length

  function togglePanel(
    panel: "branch" | "notifications" | "problems" | "lsp" | "mcp",
  ) {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function handleProblemsClick() {
    setPanelOpen(true)
    setActiveBottomTab("Problems")
    togglePanel("problems")
  }

  function handleTabSizeClick() {
    toggleTabSize()
    const nextSize = tabSize === 2 ? 4 : 2
    showToast(`Indentation set to Spaces: ${nextSize}`)
  }

  async function handleServerConnectionClick() {
    const isOk = await checkServerConnection()
    showToast(
      isOk
        ? "Connected to Local Go Server"
        : "Unable to reach Local Go Server (Offline)",
    )
  }

  // Handle click outside and Escape key to close any active popover
  useEffect(() => {
    if (!activePanel) return

    function handleMouseDown(e: MouseEvent) {
      if (
        statusBarRef.current &&
        !statusBarRef.current.contains(e.target as Node)
      ) {
        setActivePanel(null)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActivePanel(null)
      }
    }

    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activePanel])

  return (
    <footer className="status-bar" ref={statusBarRef}>
      <div className="status-group">
        {isGitRepo && activeBranch ? (
          <>
            <button
              className={activePanel === "branch" ? "status-button-active" : ""}
              onClick={() => togglePanel("branch")}
              title={`Active Branch: ${activeBranch}${
                isDirty ? " (modified)" : ""
              }`}
              type="button"
            >
              <Icon name="branch" size={13} /> {activeBranch}
              {isDirty ? "*" : ""}
            </button>
            <button
              className="sync-button hover:text-[var(--color-ink)]"
              onClick={gitSync}
              title={`Synchronize Changes with Remote (${behind} behind, ${ahead} ahead)`}
              type="button"
            >
              <Icon name="cloud" size={13} />
              {(behind > 0 || ahead > 0) && (
                <span className="text-[10px]">
                  {behind}↓ {ahead}↑
                </span>
              )}
            </button>
          </>
        ) : null}
        <button
          className={activePanel === "problems" ? "status-button-active" : ""}
          onClick={handleProblemsClick}
          type="button"
        >
          <Icon name="error" size={13} /> {errorCount}
          <Icon name="warning" size={13} /> {warningCount}
        </button>
      </div>

      <div className="status-group">
        <CursorStatusItem />
        <button
          className="status-item cursor-pointer hover:text-[var(--color-ink)]"
          onClick={handleTabSizeClick}
          title="Indentation (Click to toggle Spaces 2 / 4)"
          type="button"
        >
          Spaces: {tabSize}
        </button>
        <span className="status-item" title="File Encoding">
          {encoding}
        </span>
        <span className="status-item" title="Language Mode">
          {activeLanguage}
        </span>
        <button
          className={`status-item cursor-pointer hover:text-[var(--color-ink)] ${
            activePanel === "lsp" ? "status-button-active" : ""
          }`}
          onClick={() => togglePanel("lsp")}
          title="Language Server Protocol (LSP) Status (Click to inspect)"
          type="button"
        >
          <span
            className={`status-dot ${
              serverConnected ? "status-dot-online" : "status-dot-offline"
            }`}
          />{" "}
          LSP
        </button>
        <button
          className={`status-item cursor-pointer hover:text-[var(--color-ink)] ${
            activePanel === "mcp" ? "status-button-active" : ""
          }`}
          onClick={() => togglePanel("mcp")}
          title="Model Context Protocol (MCP) & CodeGraph Status"
          type="button"
        >
          <span
            className={`status-dot ${
              serverConnected ? "status-dot-online" : "status-dot-offline"
            }`}
          />{" "}
          MCP
        </button>
        <IndexStatusPill />
        <PerfStatusPill />
        <button
          className="status-item cursor-pointer hover:text-[var(--color-ink)]"
          onClick={handleServerConnectionClick}
          title={
            serverConnected
              ? "Connected to Local Go Server (Click to re-check)"
              : "Disconnected from Local Go Server (Click to retry)"
          }
          type="button"
        >
          <span
            className={`status-dot ${
              serverConnected ? "status-dot-online" : "status-dot-offline"
            }`}
          />{" "}
          Local: {serverConnected ? "Connected" : "Offline"}
        </button>
        <button
          aria-label={`${unreadCount} unread notifications`}
          className={
            activePanel === "notifications"
              ? "status-button-active notification-button"
              : "notification-button"
          }
          onClick={() => togglePanel("notifications")}
          type="button"
        >
          <Icon name="bell" size={13} />
          {unreadCount > 0 && (
            <span className="notification-count">{unreadCount}</span>
          )}
        </button>
      </div>

      {activePanel === "branch" && (
        <BranchPopover onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "problems" && (
        <ProblemsPopover onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "lsp" && (
        <LspStatusPopover onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "mcp" && (
        <McpStatusPopover onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "notifications" && (
        <NotificationsPopover onClose={() => setActivePanel(null)} />
      )}
    </footer>
  )
}

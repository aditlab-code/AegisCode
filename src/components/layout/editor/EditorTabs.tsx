import { useEffect, useRef, useState, type DragEvent } from "react"
import { createPortal } from "react-dom"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import { isGitDiffTab, parseGitDiffTab } from "../../../utils/gitDiffTab"
import { hasConflictMarkers } from "../../../utils/gitConflict"
import {
  getViewerTypeForFile,
  isGraphTab,
  isSettingsTab,
  parseGraphTab,
} from "./viewers/viewerTypes"
import { normalizeWorkspacePath } from "../../../utils/workspaceApi"

interface ContextMenuData {
  x: number
  y: number
  tab: string
}

interface EditorTabsProps {
  groupId?: "group1" | "group2"
  onToggleFind: () => void
  isFindOpen: boolean
}

export function EditorTabs({
  groupId = "group1",
  onToggleFind,
  isFindOpen,
}: EditorTabsProps) {
  const {
    group1,
    group2,
    focusedGroup,
    setFocusedGroup,
    setActiveTabInGroup,
    closeTabInGroup,
    moveTabBetweenGroups,
    reorderTabsInGroup,
    splitEditor,
    toggleSplitEditor,
    closeSplitEditor,
    dirtyFiles,
    saveFile,
    revertFile,
    requestRevertFile,
    showToast,
    startDebugging,
    runFileInTerminal,
    rootWorkspacePath,
    setActiveActivity,
    setSidebarOpen,
    pinnedTabs,
    togglePinTab,
  } = useWorkbenchStore(
    useShallow((s) => ({
      group1: s.group1,
      group2: s.group2,
      focusedGroup: s.focusedGroup,
      setFocusedGroup: s.setFocusedGroup,
      setActiveTabInGroup: s.setActiveTabInGroup,
      closeTabInGroup: s.closeTabInGroup,
      moveTabBetweenGroups: s.moveTabBetweenGroups,
      reorderTabsInGroup: s.reorderTabsInGroup,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      closeSplitEditor: s.closeSplitEditor,
      dirtyFiles: s.dirtyFiles,
      saveFile: s.saveFile,
      revertFile: s.revertFile,
      requestRevertFile: s.requestRevertFile,
      showToast: s.showToast,
      startDebugging: s.startDebugging,
      runFileInTerminal: s.runFileInTerminal,
      rootWorkspacePath: s.rootWorkspacePath,
      setActiveActivity: s.setActiveActivity,
      setSidebarOpen: s.setSidebarOpen,
      pinnedTabs: s.pinnedTabs,
      togglePinTab: s.togglePinTab,
    })),
  )

  const currentGroup = groupId === "group2" ? group2 : group1
  const isFocused = focusedGroup === currentGroup.id

  const tabFlagsMap = useWorkbenchStore(
    useShallow((s) => {
      const flags: Record<string, string> = {}
      for (const tab of currentGroup.tabs) {
        const isDiff = isGitDiffTab(tab)
        const rawTabFile = isDiff ? parseGitDiffTab(tab)?.file || "" : tab
        const cleanTabFile = normalizeWorkspacePath(
          rawTabFile,
          s.rootWorkspacePath,
        )
        const buf =
          s.fileBuffers[cleanTabFile] ||
          s.fileBuffers[rawTabFile] ||
          s.fileBuffers[tab]
        const isDirty = Boolean(
          s.dirtyFiles[cleanTabFile] ||
            s.dirtyFiles[rawTabFile] ||
            s.dirtyFiles[tab] ||
            buf?.isDirty,
        )
        const hasDiskConflict = Boolean(buf?.hasDiskConflict)
        const isDeletedOnDisk = Boolean(buf?.isDeletedOnDisk)
        const hasConflict = Boolean(
          buf?.content && hasConflictMarkers(buf.content),
        )
        flags[tab] = `${isDirty ? 1 : 0}:${hasDiskConflict ? 1 : 0}:${
          isDeletedOnDisk ? 1 : 0
        }:${hasConflict ? 1 : 0}`
      }
      return flags
    }),
  )

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null)
  const [runMenuOpen, setRunMenuOpen] = useState(false)
  const [preferredRunMode, setPreferredRunMode] =
    useState<"terminal" | "debug">(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("aegis_preferred_run_mode")
        if (saved === "debug" || saved === "terminal") return saved
      }
      return "terminal"
    })
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const runMenuRef = useRef<HTMLDivElement>(null)

  const selectRunMode = (mode: "terminal" | "debug") => {
    setPreferredRunMode(mode)
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_preferred_run_mode", mode)
    }
  }

  useEffect(() => {
    function handleDismiss(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null)
      }
      if (
        runMenuRef.current &&
        !runMenuRef.current.contains(e.target as Node)
      ) {
        setRunMenuOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setContextMenu(null)
        setRunMenuOpen(false)
      }
    }
    function handleResize() {
      setContextMenu(null)
      setRunMenuOpen(false)
    }

    window.addEventListener("click", handleDismiss)
    window.addEventListener("contextmenu", handleDismiss)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("click", handleDismiss)
      window.removeEventListener("contextmenu", handleDismiss)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tabListRef.current) return
    const activeEl = tabListRef.current.querySelector(".editor-tab-active")
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [currentGroup.activeTab])

  function handleDragStart(
    e: DragEvent<HTMLButtonElement>,
    filename: string,
    index: number,
  ) {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        filename,
        sourceGroup: currentGroup.id,
        sourceIndex: index,
      }),
    )
    e.dataTransfer.effectAllowed = "move"
  }

  function handleTabDrop(e: DragEvent, dropIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIndex(null)
    setIsDropTarget(false)

    try {
      const raw = e.dataTransfer.getData("application/json")
      if (!raw) return
      const data = JSON.parse(raw) as {
        filename: string
        sourceGroup: "group1" | "group2"
        sourceIndex: number
      }

      if (data.sourceGroup === currentGroup.id) {
        reorderTabsInGroup(currentGroup.id, data.sourceIndex, dropIndex)
      } else {
        moveTabBetweenGroups(
          data.sourceGroup,
          currentGroup.id,
          data.filename,
          dropIndex,
        )
      }
    } catch {
      // drop parsing failed safely
    }
  }

  function handleTabListDrop(e: DragEvent) {
    e.preventDefault()
    setIsDropTarget(false)
    setDragOverIndex(null)

    try {
      const raw = e.dataTransfer.getData("application/json")
      if (!raw) return
      const data = JSON.parse(raw) as {
        filename: string
        sourceGroup: "group1" | "group2"
        sourceIndex: number
      }

      if (data.sourceGroup !== currentGroup.id) {
        moveTabBetweenGroups(
          data.sourceGroup,
          currentGroup.id,
          data.filename,
          currentGroup.tabs.length,
        )
      }
    } catch {
      // drop parsing failed safely
    }
  }

  return (
    <div
      className={`editor-tabs ${isFocused ? "editor-tabs-focused" : ""} ${
        isDropTarget ? "editor-tabs-droptarget" : ""
      }`}
      onClick={() => setFocusedGroup(currentGroup.id)}
    >
      <div
        className="tab-list"
        ref={tabListRef}
        onDragLeave={() => setIsDropTarget(false)}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDropTarget(true)
        }}
        onDrop={handleTabListDrop}
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY
          }
        }}
      >
        {currentGroup.tabs.map((tab, index) => {
          const isActive = tab === currentGroup.activeTab
          const isDiff = isGitDiffTab(tab)
          const isGraph = isGraphTab(tab)
          const isSettings = isSettingsTab(tab)
          const diffInfo = isDiff ? parseGitDiffTab(tab) : null
          const graphInfo = isGraph ? parseGraphTab(tab) : null
          const tabLabel = diffInfo
            ? diffInfo.displayName
            : graphInfo
              ? graphInfo.displayName
              : isSettings
                ? "Settings"
                : tab.split("/").pop() || tab
          const rawTabFile = isDiff ? diffInfo?.file || "" : tab
          const cleanTabFile = normalizeWorkspacePath(
            rawTabFile,
            rootWorkspacePath,
          )
          const flags = tabFlagsMap[tab] || "0:0:0:0"
          const [
            isDirtyFlag,
            hasDiskConflictFlag,
            isDeletedOnDiskFlag,
            hasConflictFlag,
          ] = flags.split(":")
          const isDirty = isDirtyFlag === "1"
          const hasDiskConflict = hasDiskConflictFlag === "1"
          const isDeletedOnDisk = isDeletedOnDiskFlag === "1"
          const hasConflict = hasConflictFlag === "1"

          return (
            <button
              className={`editor-tab ${isActive ? "editor-tab-active" : ""} ${
                dragOverIndex === index ? "tab-drag-over" : ""
              }`}
              draggable
              key={tab}
              onClick={() => setActiveTabInGroup(currentGroup.id, tab)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              onDragLeave={() => setDragOverIndex(null)}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverIndex(index)
              }}
              onDragStart={(e) => handleDragStart(e, tab, index)}
              onDrop={(e) => handleTabDrop(e, index)}
              title={
                isDeletedOnDisk
                  ? `${tabLabel} (Deleted from disk)`
                  : hasConflict
                    ? `${tabLabel} (Unresolved Git merge conflict markers detected)`
                    : hasDiskConflict
                      ? `${tabLabel} (File changed on disk while unsaved)`
                      : tabLabel
              }
              type="button"
            >
              <Icon
                className={
                  isDiff
                    ? "text-(--color-accent) shrink-0"
                    : isGraph
                      ? "text-accent shrink-0"
                      : isSettings
                        ? "text-accent shrink-0"
                        : isDeletedOnDisk
                          ? "text-error shrink-0"
                          : "shrink-0"
                }
                name={
                  isDiff
                    ? "git"
                    : isGraph
                      ? "zap"
                      : isSettings
                        ? "settings"
                        : isDeletedOnDisk
                          ? "trash"
                          : getViewerTypeForFile(tab) === "image"
                            ? "image"
                            : getViewerTypeForFile(tab) === "csv"
                              ? "table"
                              : "code"
                }
                size={14}
              />
              <span
                className={`truncate ${
                  isDeletedOnDisk ? "line-through opacity-70 text-error" : ""
                }`}
              >
                {tabLabel}
                {isDeletedOnDisk ? " (deleted)" : ""}
              </span>
              {hasConflict && (
                <span
                  aria-label="Git merge conflict markers detected"
                  className="px-1.5 py-0.5 rounded text-[9px] bg-warning/20 text-warning font-semibold border border-warning/40 shrink-0 flex items-center gap-1 select-none"
                  title="Conflict markers detected (<<<<<<< HEAD, =======, >>>>>>>)"
                >
                  <Icon name="warning" size={10} />
                  <span>CONFLICT</span>
                </span>
              )}
              <span className="tab-actions-container">
                {hasDiskConflict && (
                  <span
                    aria-label="File modified on disk while unsaved"
                    className="text-warning shrink-0 flex items-center"
                    title="Conflict: file modified externally on disk"
                  >
                    <Icon name="warning" size={12} />
                  </span>
                )}
                {isDirty && (
                  <span
                    aria-label="Unsaved changes"
                    className="tab-dirty-dot"
                    title="Unsaved changes"
                  />
                )}
                {pinnedTabs.has(tab) ? (
                  <span
                    aria-label={`Unpin ${tab}`}
                    className="close-tab-trigger text-accent"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePinTab(tab)
                    }}
                    role="button"
                    tabIndex={0}
                    title="Pinned tab (click to unpin)"
                  >
                    <Icon name="sparkle" size={11} />
                  </span>
                ) : (
                  <span
                    aria-label={`Close ${tab}`}
                    className="close-tab-trigger"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTabInGroup(currentGroup.id, tab)
                    }}
                    role="button"
                    tabIndex={0}
                    title="Close tab"
                  >
                    <Icon name="close" size={12} />
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="editor-actions">
        <IconButton
          active={isFindOpen}
          label="Find in file (Ctrl+F)"
          onClick={onToggleFind}
        >
          <Icon name="search" size={14} />
        </IconButton>
        {(() => {
          const activeRaw = currentGroup.activeTab || ""
          const activeClean = normalizeWorkspacePath(
            activeRaw,
            rootWorkspacePath,
          )
          const isCurrentDirty = Boolean(
            dirtyFiles[activeClean] || dirtyFiles[activeRaw],
          )
          return (
            <IconButton
              disabled={!isCurrentDirty}
              label={
                isCurrentDirty
                  ? "Revert / discard changes"
                  : "No changes to revert"
              }
              onClick={() => requestRevertFile(currentGroup.activeTab)}
            >
              <Icon name="history" size={14} />
            </IconButton>
          )
        })()}
        <IconButton
          label="Save file (Ctrl+S)"
          onClick={() => saveFile(currentGroup.activeTab)}
        >
          <Icon name="check" size={14} />
        </IconButton>
        <div className="relative flex items-center" ref={runMenuRef}>
          <IconButton
            disabled={!currentGroup.activeTab}
            label={
              preferredRunMode === "debug"
                ? `Debug ${currentGroup.activeTab || "file"} (F5)`
                : `Run ${currentGroup.activeTab || "file"} in terminal (Ctrl+F5)`
            }
            onClick={() => {
              if (preferredRunMode === "debug") {
                void startDebugging(currentGroup.activeTab)
              } else {
                void runFileInTerminal(currentGroup.activeTab)
              }
            }}
          >
            <Icon
              name={preferredRunMode === "debug" ? "debug" : "play"}
              size={14}
            />
          </IconButton>
          <IconButton
            disabled={!currentGroup.activeTab}
            label="Run or Debug options"
            onClick={() => setRunMenuOpen((prev) => !prev)}
            active={runMenuOpen}
            className="px-0.5!"
          >
            <Icon name="chevron-down" size={10} />
          </IconButton>

          {runMenuOpen && (
            <div
              className="editor-tab-context-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 1000,
              }}
            >
              <div className="context-menu-header">Run / Debug Target</div>
              <button
                className="context-menu-item"
                onClick={() => {
                  selectRunMode("terminal")
                  setRunMenuOpen(false)
                  void runFileInTerminal(currentGroup.activeTab)
                }}
                type="button"
              >
                <Icon name="play" size={12} />
                <span>Run in Terminal</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  selectRunMode("debug")
                  setRunMenuOpen(false)
                  void startDebugging(currentGroup.activeTab)
                }}
                type="button"
              >
                <Icon name="debug" size={12} />
                <span>Start Debugging (F5)</span>
              </button>
            </div>
          )}
        </div>
        {currentGroup.id === "group1" ? (
          <IconButton
            active={splitEditor}
            label="Split editor (Ctrl+\\)"
            onClick={toggleSplitEditor}
          >
            <Icon name="split" />
          </IconButton>
        ) : (
          <IconButton label="Close window group" onClick={closeSplitEditor}>
            <Icon name="close" size={14} />
          </IconButton>
        )}
      </div>

      {/* Floating Tab Context Menu */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="editor-tab-context-menu"
            ref={contextMenuRef}
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
          >
            <div className="context-menu-header">{contextMenu.tab}</div>
            <button
              className="context-menu-item"
              onClick={() => {
                togglePinTab(contextMenu.tab)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="sparkle" size={12} />
              <span>
                {pinnedTabs.has(contextMenu.tab) ? "Unpin Tab" : "Pin Tab"}
              </span>
            </button>
            <button
              className="context-menu-item"
              disabled={pinnedTabs.has(contextMenu.tab)}
              onClick={() => {
                if (!pinnedTabs.has(contextMenu.tab)) {
                  closeTabInGroup(currentGroup.id, contextMenu.tab)
                }
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="close" size={12} />
              <span>Close</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                const others = currentGroup.tabs.filter(
                  (t) => t !== contextMenu.tab && !pinnedTabs.has(t),
                )
                for (const t of others) {
                  closeTabInGroup(currentGroup.id, t)
                }
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="close" size={12} />
              <span>Close Others</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                const toClose = currentGroup.tabs.filter(
                  (t) => !pinnedTabs.has(t),
                )
                for (const t of toClose) {
                  closeTabInGroup(currentGroup.id, t)
                }
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="close" size={12} />
              <span>Close All</span>
            </button>
            <div className="context-menu-separator" />
            <button
              className="context-menu-item"
              onClick={() => {
                void runFileInTerminal(contextMenu.tab)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="play" size={12} />
              <span>Run in Terminal</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                void startDebugging(contextMenu.tab)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="debug" size={12} />
              <span>Start Debugging</span>
            </button>
            <div className="context-menu-separator" />
            <button
              className="context-menu-item"
              onClick={async () => {
                const full = rootWorkspacePath
                  ? `${rootWorkspacePath}/${contextMenu.tab}`
                  : contextMenu.tab
                try {
                  await navigator.clipboard.writeText(full)
                  showToast("Copied full path")
                } catch {
                  // fallback
                }
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="copy" size={12} />
              <span>Copy Full Path</span>
            </button>
            <button
              className="context-menu-item"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(contextMenu.tab)
                  showToast("Copied relative path")
                } catch {
                  // fallback
                }
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="copy" size={12} />
              <span>Copy Relative Path</span>
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                setActiveActivity("Explorer")
                setSidebarOpen(true)
                showToast(`Revealed in Explorer`)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="explorer" size={12} />
              <span>Reveal in Explorer</span>
            </button>
            <div className="context-menu-separator" />
            <button
              className="context-menu-item"
              disabled={!dirtyFiles[contextMenu.tab]}
              onClick={() => {
                requestRevertFile(contextMenu.tab)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="history" size={12} />
              <span>Revert File</span>
            </button>
            <button
              className="context-menu-item"
              disabled={!dirtyFiles[contextMenu.tab]}
              onClick={() => {
                saveFile(contextMenu.tab)
                setContextMenu(null)
              }}
              type="button"
            >
              <Icon name="check" size={12} />
              <span>Save</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

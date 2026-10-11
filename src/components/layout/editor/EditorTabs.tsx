import { useEffect, useRef, useState, type DragEvent } from "react"
import { createPortal } from "react-dom"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { isGitDiffTab, parseGitDiffTab } from "../../../utils/gitDiffTab"

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
    fileBuffers,
    saveFile,
    revertFile,
    requestRevertFile,
    showToast,
  } = useWorkbench()

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleDismiss(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null)
    }
    function handleResize() {
      setContextMenu(null)
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

  const currentGroup = groupId === "group2" ? group2 : group1
  const isFocused = focusedGroup === currentGroup.id

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
        onDragLeave={() => setIsDropTarget(false)}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDropTarget(true)
        }}
        onDrop={handleTabListDrop}
      >
        {currentGroup.tabs.map((tab, index) => {
          const isActive = tab === currentGroup.activeTab
          const isDiff = isGitDiffTab(tab)
          const diffInfo = isDiff ? parseGitDiffTab(tab) : null
          const tabLabel = diffInfo ? diffInfo.displayName : tab
          const buf = isDiff
            ? fileBuffers[diffInfo?.file || ""]
            : fileBuffers[tab]
          const isDirty = Boolean(buf?.isDirty)
          const hasDiskConflict = Boolean(buf?.hasDiskConflict)
          const isDeletedOnDisk = Boolean(buf?.isDeletedOnDisk)

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
                  : hasDiskConflict
                    ? `${tabLabel} (File changed on disk while unsaved)`
                    : tabLabel
              }
              type="button"
            >
              <Icon
                className={
                  isDiff
                    ? "text-[var(--color-accent)] shrink-0"
                    : isDeletedOnDisk
                      ? "text-error shrink-0"
                      : "shrink-0"
                }
                name={isDiff ? "git" : isDeletedOnDisk ? "trash" : "code"}
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
        <IconButton
          disabled={!fileBuffers[currentGroup.activeTab]?.isDirty}
          label={
            fileBuffers[currentGroup.activeTab]?.isDirty
              ? "Revert / discard changes"
              : "No changes to revert"
          }
          onClick={() => requestRevertFile(currentGroup.activeTab)}
        >
          <Icon name="history" size={14} />
        </IconButton>
        <IconButton
          label="Save file (Ctrl+S)"
          onClick={() => saveFile(currentGroup.activeTab)}
        >
          <Icon name="check" size={14} />
        </IconButton>
        <IconButton
          label="Run file (unscoped in Phase 1)"
          onClick={() => showToast("Code runner unscoped for Phase 1")}
        >
          <Icon name="play" />
        </IconButton>
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
                closeTabInGroup(currentGroup.id, contextMenu.tab)
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
                  (t) => t !== contextMenu.tab,
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
                const all = [...currentGroup.tabs]
                for (const t of all) {
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
              disabled={!fileBuffers[contextMenu.tab]?.isDirty}
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
              disabled={!fileBuffers[contextMenu.tab]?.isDirty}
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

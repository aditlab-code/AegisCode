import { useState, type DragEvent } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbench } from "../../../context/WorkbenchContext"

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
    showToast,
  } = useWorkbench()

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)

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
          const isDirty = fileBuffers[tab]?.isDirty

          return (
            <button
              className={`editor-tab ${isActive ? "editor-tab-active" : ""} ${
                dragOverIndex === index ? "tab-drag-over" : ""
              }`}
              draggable
              key={tab}
              onClick={() => setActiveTabInGroup(currentGroup.id, tab)}
              onDragLeave={() => setDragOverIndex(null)}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverIndex(index)
              }}
              onDragStart={(e) => handleDragStart(e, tab, index)}
              onDrop={(e) => handleTabDrop(e, index)}
              type="button"
            >
              <Icon name="code" size={14} />
              <span>{tab}</span>
              {isDirty ? (
                <span
                  aria-label="Unsaved changes"
                  className="tab-dirty-dot"
                  title="Unsaved changes"
                />
              ) : (
                <span
                  className="close-tab-trigger"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTabInGroup(currentGroup.id, tab)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <Icon name="close" size={12} />
                </span>
              )}
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
    </div>
  )
}

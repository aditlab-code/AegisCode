import { useEffect, useRef, useState } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { EditorTabs } from "./EditorTabs"
import { EditorBreadcrumbs } from "./EditorBreadcrumbs"
import { CodePane } from "./CodePane"
import { EditorFindWidget } from "./EditorFindWidget"
import { EditorEmptyState } from "./EditorEmptyState"

export function Editor() {
  const {
    splitEditor,
    splitRatio,
    setSplitRatio,
    group1,
    group2,
    focusedGroup,
    closeSplitEditor,
  } = useWorkbench()

  const [findOpenGroup1, setFindOpenGroup1] = useState(false)
  const [findOpenGroup2, setFindOpenGroup2] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasTabsGroup1 = group1.tabs.length > 0 && Boolean(group1.activeTab)
  const hasTabsGroup2 = group2.tabs.length > 0 && Boolean(group2.activeTab)

  useEffect(() => {
    if (!isResizing) return

    function handleMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width <= 0) return

      const clientX = e.clientX
      const offset = clientX - rect.left
      const newRatio = (offset / rect.width) * 100
      const clamped = Math.max(20, Math.min(80, newRatio))
      setSplitRatio(Math.round(clamped))
    }

    function handleMouseUp() {
      setIsResizing(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing, setSplitRatio])

  if (!splitEditor) {
    if (!hasTabsGroup1) {
      return (
        <section className="editor relative editor-empty" data-active-file="">
          <EditorEmptyState groupId="group1" />
        </section>
      )
    }

    return (
      <section
        className="editor relative"
        data-active-file={group1.activeTab || ""}
      >
        <EditorTabs
          groupId="group1"
          isFindOpen={findOpenGroup1}
          onToggleFind={() => setFindOpenGroup1((v) => !v)}
        />
        <EditorBreadcrumbs file={group1.activeTab} />
        <EditorFindWidget
          isOpen={findOpenGroup1}
          onClose={() => setFindOpenGroup1(false)}
        />
        <div className="editor-panes">
          <CodePane
            filename={group1.activeTab}
            isFocused={focusedGroup === "group1"}
            paneId="primary"
          />
        </div>
      </section>
    )
  }

  return (
    <section className="editor-split-container relative" ref={containerRef}>
      {isResizing && <div className="split-resize-overlay" />}

      {/* Group 1 Window */}
      <div
        className={`editor-window-group ${!hasTabsGroup1 ? "group-empty" : ""}`}
        data-active-file={group1.activeTab || ""}
        style={{ width: `${splitRatio}%` }}
      >
        {hasTabsGroup1 ? (
          <>
            <EditorTabs
              groupId="group1"
              isFindOpen={findOpenGroup1}
              onToggleFind={() => setFindOpenGroup1((v) => !v)}
            />
            <EditorBreadcrumbs file={group1.activeTab} />
            <EditorFindWidget
              isOpen={findOpenGroup1}
              onClose={() => setFindOpenGroup1(false)}
            />
            <div className="editor-panes">
              <CodePane
                filename={group1.activeTab}
                isFocused={focusedGroup === "group1"}
                paneId="primary"
              />
            </div>
          </>
        ) : (
          <div className="empty-group-container flex flex-col h-full w-full">
            <div className="empty-group-header flex items-center justify-between px-3 py-1.5 border-b border-line">
              <span className="text-[10px] tracking-wider uppercase text-ink-muted">
                Group 1 (Empty)
              </span>
            </div>
            <EditorEmptyState groupId="group1" />
          </div>
        )}
      </div>

      {/* Draggable Divider Sash */}
      <div
        className={`split-resizer-sash ${
          isResizing ? "split-resizer-sash-active" : ""
        }`}
        onDoubleClick={() => setSplitRatio(50)}
        onMouseDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
        }}
        role="separator"
        title="Drag to resize window width (double-click to reset 50:50)"
      >
        <div className="split-resizer-line" />
      </div>

      {/* Group 2 Window */}
      <div
        className={`editor-window-group ${!hasTabsGroup2 ? "group-empty" : ""}`}
        data-active-file={group2.activeTab || ""}
        style={{ width: `calc(${100 - splitRatio}% - 4px)` }}
      >
        {hasTabsGroup2 ? (
          <>
            <EditorTabs
              groupId="group2"
              isFindOpen={findOpenGroup2}
              onToggleFind={() => setFindOpenGroup2((v) => !v)}
            />
            <EditorBreadcrumbs file={group2.activeTab} />
            <EditorFindWidget
              isOpen={findOpenGroup2}
              onClose={() => setFindOpenGroup2(false)}
            />
            <div className="editor-panes">
              <CodePane
                filename={group2.activeTab}
                isFocused={focusedGroup === "group2"}
                paneId="secondary"
              />
            </div>
          </>
        ) : (
          <div className="empty-group-container flex flex-col h-full w-full">
            <div className="empty-group-header flex items-center justify-between px-3 py-1.5 border-b border-line">
              <span className="text-[10px] tracking-wider uppercase text-ink-muted">
                Group 2 (Empty)
              </span>
              <IconButton label="Close Split Group" onClick={closeSplitEditor}>
                <Icon name="close" size={13} />
              </IconButton>
            </div>
            <EditorEmptyState groupId="group2" />
          </div>
        )}
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { EditorTabs } from "./EditorTabs"
import { EditorBreadcrumbs } from "./EditorBreadcrumbs"
import { CodePane } from "./CodePane"
import { EditorFindWidget } from "./EditorFindWidget"

export function Editor() {
  const {
    splitEditor,
    splitRatio,
    setSplitRatio,
    group1,
    group2,
    focusedGroup,
  } = useWorkbench()

  const [findOpenGroup1, setFindOpenGroup1] = useState(false)
  const [findOpenGroup2, setFindOpenGroup2] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
    return (
      <section className="editor relative">
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
            filename={group1.activeTab || "App.tsx"}
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
      <div className="editor-window-group" style={{ width: `${splitRatio}%` }}>
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
            filename={group1.activeTab || "App.tsx"}
            isFocused={focusedGroup === "group1"}
            paneId="primary"
          />
        </div>
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
        className="editor-window-group"
        style={{ width: `calc(${100 - splitRatio}% - 4px)` }}
      >
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
            filename={group2.activeTab || "Status.tsx"}
            isFocused={focusedGroup === "group2"}
            paneId="secondary"
          />
        </div>
      </div>
    </section>
  )
}

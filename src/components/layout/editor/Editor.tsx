import { useEffect, useRef, useState } from "react"
import { useWorkbenchStore, useShallow } from "../../../store"
import { DebugToolbar } from "./DebugToolbar"
import { EditorGroup } from "./EditorGroup"
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
    findStateGroup1,
    findStateGroup2,
    closeFind,
    toggleFind,
  } = useWorkbenchStore(
    useShallow((s) => ({
      splitEditor: s.splitEditor,
      splitRatio: s.splitRatio,
      setSplitRatio: s.setSplitRatio,
      group1: s.group1,
      group2: s.group2,
      focusedGroup: s.focusedGroup,
      closeSplitEditor: s.closeSplitEditor,
      findStateGroup1: s.findStateGroup1,
      findStateGroup2: s.findStateGroup2,
      closeFind: s.closeFind,
      toggleFind: s.toggleFind,
    })),
  )

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
          <DebugToolbar />
          <EditorEmptyState groupId="group1" />
        </section>
      )
    }

    return (
      <section
        className="editor relative"
        data-active-file={group1.activeTab || ""}
      >
        <DebugToolbar />
        <EditorGroup
          activeTab={group1.activeTab}
          className="border-r-0"
          findState={findStateGroup1}
          groupId="group1"
          hasTabs={hasTabsGroup1}
          isFocused={focusedGroup === "group1"}
          onCloseFind={() => closeFind("group1")}
          onFocus={() => useWorkbenchStore.getState().setFocusedGroup("group1")}
          onToggleFind={() => toggleFind("group1")}
          paneId="primary"
        />
      </section>
    )
  }

  return (
    <section className="editor-split-container relative" ref={containerRef}>
      <DebugToolbar />
      {isResizing && <div className="split-resize-overlay" />}

      {/* Group 1 Window */}
      <EditorGroup
        activeTab={group1.activeTab}
        findState={findStateGroup1}
        groupId="group1"
        hasTabs={hasTabsGroup1}
        isFocused={focusedGroup === "group1"}
        onCloseFind={() => closeFind("group1")}
        onFocus={() => useWorkbenchStore.getState().setFocusedGroup("group1")}
        onToggleFind={() => toggleFind("group1")}
        paneId="primary"
        style={{ width: `${splitRatio}%` }}
      />

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
      <EditorGroup
        activeTab={group2.activeTab}
        findState={findStateGroup2}
        groupId="group2"
        hasTabs={hasTabsGroup2}
        isFocused={focusedGroup === "group2"}
        onCloseFind={() => closeFind("group2")}
        onCloseGroup={closeSplitEditor}
        onFocus={() => useWorkbenchStore.getState().setFocusedGroup("group2")}
        onToggleFind={() => toggleFind("group2")}
        paneId="secondary"
        style={{ width: `calc(${100 - splitRatio}% - 4px)` }}
      />
    </section>
  )
}
export default Editor

import { useEffect, useRef, useState } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import { EditorTabs } from "./EditorTabs"
import { EditorBreadcrumbs } from "./EditorBreadcrumbs"
import { CodePane } from "./CodePane"
import { DiffEditorPane } from "./DiffEditorPane"
import { EditorFindWidget } from "./EditorFindWidget"
import { EditorEmptyState } from "./EditorEmptyState"
import { DebugToolbar } from "./DebugToolbar"
import { isGitDiffTab } from "../../../utils/gitDiffTab"
import { getViewerTypeForFile, isSettingsTab } from "./viewers/viewerTypes"
import { ViewerPane } from "./viewers/ViewerPane"
import { SettingsView } from "../settings/SettingsView"

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

  const viewerTypeG1 = getViewerTypeForFile(group1.activeTab)
  const viewerTypeG2 = getViewerTypeForFile(group2.activeTab)

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
        <EditorTabs
          groupId="group1"
          isFindOpen={findStateGroup1.isOpen}
          onToggleFind={() => toggleFind("group1")}
        />
        <EditorBreadcrumbs file={group1.activeTab} />
        <EditorFindWidget
          filename={group1.activeTab}
          groupId="group1"
          isOpen={findStateGroup1.isOpen}
          isReplaceOpen={findStateGroup1.isReplaceOpen}
          onClose={() => closeFind("group1")}
          onToggleReplace={() => toggleFind("group1", true)}
        />
        <div className="editor-panes">
          {isGitDiffTab(group1.activeTab) ? (
            <DiffEditorPane groupId="group1" tab={group1.activeTab} />
          ) : isSettingsTab(group1.activeTab) ? (
            <SettingsView />
          ) : viewerTypeG1 !== "code" ? (
            <ViewerPane
              filename={group1.activeTab}
              groupId="group1"
              viewerType={viewerTypeG1}
            />
          ) : (
            <CodePane
              filename={group1.activeTab}
              isFocused={focusedGroup === "group1"}
              paneId="primary"
            />
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="editor-split-container relative" ref={containerRef}>
      <DebugToolbar />
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
              isFindOpen={findStateGroup1.isOpen}
              onToggleFind={() => toggleFind("group1")}
            />
            <EditorBreadcrumbs file={group1.activeTab} />
            <EditorFindWidget
              filename={group1.activeTab}
              groupId="group1"
              isOpen={findStateGroup1.isOpen}
              isReplaceOpen={findStateGroup1.isReplaceOpen}
              onClose={() => closeFind("group1")}
              onToggleReplace={() => toggleFind("group1", true)}
            />
            <div className="editor-panes">
              {isGitDiffTab(group1.activeTab) ? (
                <DiffEditorPane groupId="group1" tab={group1.activeTab} />
              ) : isSettingsTab(group1.activeTab) ? (
                <SettingsView />
              ) : viewerTypeG1 !== "code" ? (
                <ViewerPane
                  filename={group1.activeTab}
                  groupId="group1"
                  viewerType={viewerTypeG1}
                />
              ) : (
                <CodePane
                  filename={group1.activeTab}
                  isFocused={focusedGroup === "group1"}
                  paneId="primary"
                />
              )}
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
              isFindOpen={findStateGroup2.isOpen}
              onToggleFind={() => toggleFind("group2")}
            />
            <EditorBreadcrumbs file={group2.activeTab} />
            <EditorFindWidget
              filename={group2.activeTab}
              groupId="group2"
              isOpen={findStateGroup2.isOpen}
              isReplaceOpen={findStateGroup2.isReplaceOpen}
              onClose={() => closeFind("group2")}
              onToggleReplace={() => toggleFind("group2", true)}
            />
            <div className="editor-panes">
              {isGitDiffTab(group2.activeTab) ? (
                <DiffEditorPane groupId="group2" tab={group2.activeTab} />
              ) : isSettingsTab(group2.activeTab) ? (
                <SettingsView />
              ) : viewerTypeG2 !== "code" ? (
                <ViewerPane
                  filename={group2.activeTab}
                  groupId="group2"
                  viewerType={viewerTypeG2}
                />
              ) : (
                <CodePane
                  filename={group2.activeTab}
                  isFocused={focusedGroup === "group2"}
                  paneId="secondary"
                />
              )}
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

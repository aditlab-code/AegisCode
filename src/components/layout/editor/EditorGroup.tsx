import type { CSSProperties } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { EditorTabs } from "./EditorTabs"
import { EditorBreadcrumbs } from "./EditorBreadcrumbs"
import { EditorFindWidget } from "./EditorFindWidget"
import { EditorEmptyState } from "./EditorEmptyState"
import { DiffEditorPane } from "./DiffEditorPane"
import { ViewerPane } from "./viewers/ViewerPane"
import { SettingsView } from "../settings/SettingsView"
import { CodePane } from "./CodePane"
import { isGitDiffTab } from "../../../utils/gitDiffTab"
import { getViewerTypeForFile, isSettingsTab } from "./viewers/viewerTypes"

import type { FindWidgetState } from "../../../types/workbench"

export interface EditorGroupProps {
  groupId: "group1" | "group2"
  activeTab: string | null
  hasTabs: boolean
  isFocused: boolean
  findState: FindWidgetState
  onToggleFind: () => void
  onCloseFind: () => void
  paneId: "primary" | "secondary"
  style?: CSSProperties
  className?: string
  onCloseGroup?: () => void
  onFocus?: () => void
}

export function EditorGroup({
  groupId,
  activeTab,
  hasTabs,
  isFocused,
  findState,
  onToggleFind,
  onCloseFind,
  paneId,
  style,
  className = "",
  onCloseGroup,
  onFocus,
}: EditorGroupProps) {
  const viewerType = getViewerTypeForFile(activeTab)

  if (!hasTabs) {
    return (
      <div
        className={`editor-group editor-window-group group-empty empty-group-container flex flex-col h-full w-full ${className}`}
        style={style}
        onClick={onFocus}
      >
        <div className="empty-group-header flex items-center justify-between px-3 py-1.5 border-b border-line">
          <span className="text-[10px] tracking-wider uppercase text-ink-muted">
            {groupId === "group1" ? "Group 1" : "Group 2"} (Empty)
          </span>
          {onCloseGroup && (
            <IconButton label="Close Split Group" onClick={onCloseGroup}>
              <Icon name="close" size={13} />
            </IconButton>
          )}
        </div>
        <EditorEmptyState groupId={groupId} />
      </div>
    )
  }

  return (
    <div
      className={`editor-group editor-window-group ${
        isFocused ? "editor-group-focused" : ""
      } ${className}`}
      data-active-file={activeTab || ""}
      data-group-id={groupId}
      style={style}
      onClick={onFocus}
    >
      <EditorTabs
        groupId={groupId}
        isFindOpen={findState.isOpen}
        onToggleFind={onToggleFind}
      />
      <EditorBreadcrumbs file={activeTab} />
      <EditorFindWidget
        filename={activeTab}
        groupId={groupId}
        isOpen={findState.isOpen}
        isReplaceOpen={findState.isReplaceOpen}
        onClose={onCloseFind}
        onToggleReplace={() => onToggleFind()}
      />
      <div className="editor-group-content editor-panes">
        {isGitDiffTab(activeTab) ? (
          <DiffEditorPane groupId={groupId} tab={activeTab} />
        ) : isSettingsTab(activeTab) ? (
          <SettingsView />
        ) : viewerType !== "code" ? (
          <ViewerPane
            filename={activeTab}
            groupId={groupId}
            viewerType={viewerType}
          />
        ) : (
          <CodePane
            filename={activeTab}
            isFocused={isFocused}
            paneId={paneId}
          />
        )}
      </div>
    </div>
  )
}

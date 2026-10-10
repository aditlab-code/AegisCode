import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function ExplorerPanel() {
  const {
    files,
    group1,
    group2,
    focusedGroup,
    splitEditor,
    openFileInGroup,
    setActiveTabInGroup,
    closeTabInGroup,
    fileBuffers,
  } = useWorkbench()

  const [openEditorsOpen, setOpenEditorsOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)

  const currentTab =
    focusedGroup === "group2" && splitEditor
      ? group2.activeTab
      : group1.activeTab

  return (
    <>
      {/* OPEN EDITORS Section */}
      <button
        className="section-title section-title-clickable"
        onClick={() => setOpenEditorsOpen((v) => !v)}
        type="button"
      >
        <span
          className={`chevron-arrow ${openEditorsOpen ? "chevron-open" : ""}`}
        >
          <Icon name="chevron" size={12} />
        </span>
        <span>OPEN EDITORS</span>
      </button>

      {openEditorsOpen && (
        <div className="open-editors-list">
          {splitEditor ? (
            <>
              {/* Group 1 Subtab */}
              <div
                className={`open-editors-group-header ${
                  focusedGroup === "group1" ? "group-header-focused" : ""
                }`}
              >
                <span>GROUP 1</span>
                <small>{group1.tabs.length}</small>
              </div>
              {group1.tabs.map((tab) => {
                const isActive =
                  tab === group1.activeTab && focusedGroup === "group1"
                const isDirty = fileBuffers[tab]?.isDirty
                return (
                  <div
                    className={`file-row open-editor-row ${
                      isActive ? "file-active" : ""
                    }`}
                    key={`g1-${tab}`}
                    onClick={() => setActiveTabInGroup("group1", tab)}
                  >
                    <span className="file-icon">
                      <Icon name="code" size={13} />
                    </span>
                    <span className="file-name">{tab}</span>
                    {isDirty && (
                      <span
                        aria-label="Unsaved changes"
                        className="tab-dirty-dot"
                        title="Unsaved changes"
                      />
                    )}
                    <span
                      className="close-tab-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTabInGroup("group1", tab)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <Icon name="close" size={11} />
                    </span>
                  </div>
                )
              })}

              {/* Group 2 Subtab */}
              <div
                className={`open-editors-group-header ${
                  focusedGroup === "group2" ? "group-header-focused" : ""
                }`}
              >
                <span>GROUP 2</span>
                <small>{group2.tabs.length}</small>
              </div>
              {group2.tabs.map((tab) => {
                const isActive =
                  tab === group2.activeTab && focusedGroup === "group2"
                const isDirty = fileBuffers[tab]?.isDirty
                return (
                  <div
                    className={`file-row open-editor-row ${
                      isActive ? "file-active" : ""
                    }`}
                    key={`g2-${tab}`}
                    onClick={() => setActiveTabInGroup("group2", tab)}
                  >
                    <span className="file-icon">
                      <Icon name="code" size={13} />
                    </span>
                    <span className="file-name">{tab}</span>
                    {isDirty && (
                      <span
                        aria-label="Unsaved changes"
                        className="tab-dirty-dot"
                        title="Unsaved changes"
                      />
                    )}
                    <span
                      className="close-tab-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTabInGroup("group2", tab)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <Icon name="close" size={11} />
                    </span>
                  </div>
                )
              })}
            </>
          ) : (
            group1.tabs.map((tab) => {
              const isActive = tab === group1.activeTab
              const isDirty = fileBuffers[tab]?.isDirty
              return (
                <div
                  className={`file-row open-editor-row ${
                    isActive ? "file-active" : ""
                  }`}
                  key={tab}
                  onClick={() => setActiveTabInGroup("group1", tab)}
                >
                  <span className="file-icon">
                    <Icon name="code" size={13} />
                  </span>
                  <span className="file-name">{tab}</span>
                  {isDirty && (
                    <span
                      aria-label="Unsaved changes"
                      className="tab-dirty-dot"
                      title="Unsaved changes"
                    />
                  )}
                  <span
                    className="close-tab-trigger"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTabInGroup("group1", tab)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Icon name="close" size={11} />
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Workspace File Tree */}
      <button
        className="section-title section-title-clickable"
        onClick={() => setWorkspaceOpen((v) => !v)}
        type="button"
      >
        <span
          className={`chevron-arrow ${workspaceOpen ? "chevron-open" : ""}`}
        >
          <Icon name="chevron" size={12} />
        </span>
        <span>AEGISCODE</span>
      </button>

      {workspaceOpen && (
        <div className="file-tree">
          {files.map((file) => {
            const isCurrent = currentTab === file.label
            return (
              <button
                className={`file-row ${isCurrent ? "file-active" : ""} ${
                  file.muted ? "text-muted" : ""
                }`}
                key={file.label}
                onClick={() => {
                  if (file.icon === "file") {
                    openFileInGroup(file.label, focusedGroup)
                  }
                }}
                style={{ paddingLeft: `${10 + file.depth * 14}px` }}
                type="button"
              >
                {file.icon === "folder" ? (
                  <Icon name="chevron" size={12} />
                ) : (
                  <span className="tree-spacer" />
                )}
                <span
                  className={
                    file.icon === "folder" ? "folder-icon" : "file-icon"
                  }
                >
                  <Icon name={file.icon} size={14} />
                </span>
                <span>{file.label}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="collapsed-section">
        <Icon name="chevron" size={13} />
        <span>OUTLINE</span>
      </div>
      <div className="collapsed-section">
        <Icon name="chevron" size={13} />
        <span>TIMELINE</span>
      </div>
    </>
  )
}

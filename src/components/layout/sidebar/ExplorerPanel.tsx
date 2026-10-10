import { useState, useRef, useEffect, useMemo, type MouseEvent } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import type { FileItem, OutlineSymbol } from "../../../types/workbench"

function extractSymbols(code?: string): OutlineSymbol[] {
  if (!code) return []
  const symbols: OutlineSymbol[] = []
  const lines = code.split("\n")

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      return
    }

    const fnMatch = trimmed.match(
      /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
    )
    if (fnMatch) {
      symbols.push({ name: fnMatch[1], kind: "function", line: lineNum })
      return
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_$]+)/)
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: "class", line: lineNum })
      return
    }

    const ifaceMatch = trimmed.match(
      /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
    )
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: "interface", line: lineNum })
      return
    }

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)/)
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: "type", line: lineNum })
      return
    }

    const arrowFnMatch = trimmed.match(
      /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
    )
    if (arrowFnMatch) {
      symbols.push({ name: arrowFnMatch[1], kind: "function", line: lineNum })
      return
    }
  })

  return symbols
}

interface ContextMenuData {
  x: number
  y: number
  file: FileItem
}

export function ExplorerPanel() {
  const {
    files,
    createFile,
    renameFile,
    deleteFile,
    group1,
    group2,
    focusedGroup,
    splitEditor,
    openFileInGroup,
    setActiveTabInGroup,
    closeTabInGroup,
    fileBuffers,
    setCursorPosition,
    showToast,
  } = useWorkbench()

  const [openEditorsOpen, setOpenEditorsOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(false)

  // Filter state
  const [filterActive, setFilterActive] = useState(false)
  const [filterQuery, setFilterQuery] = useState("")

  // Inline creation state
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(
    null,
  )
  const [createName, setCreateName] = useState("")

  // Inline rename state
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentTab =
    focusedGroup === "group2" && splitEditor
      ? group2.activeTab
      : group1.activeTab

  // Close context menu on outside click or scroll
  useEffect(() => {
    function handleDismiss(e: MouseEvent | Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    window.addEventListener("click", handleDismiss)
    window.addEventListener("contextmenu", handleDismiss)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setContextMenu(null)
    })
    return () => {
      window.removeEventListener("click", handleDismiss)
      window.removeEventListener("contextmenu", handleDismiss)
    }
  }, [])

  // Collapsed folders state
  const [collapsedFolders, setCollapsedFolders] =
    useState<Record<string, boolean>>(() => {
      const initial: Record<string, boolean> = {}
      files.forEach((f) => {
        if (f.icon === "folder" && f.open === false) {
          initial[f.label] = true
        }
      })
      return initial
    })

  function toggleFolder(folderLabel: string) {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderLabel]: !prev[folderLabel],
    }))
  }

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files
    const query = filterQuery.toLowerCase().trim()
    return files.filter(
      (f) =>
        f.label.toLowerCase().includes(query) ||
        (f.path && f.path.toLowerCase().includes(query)),
    )
  }, [files, filterQuery])

  // Visible files with hierarchical folder collapse pruning
  const visibleFiles = useMemo(() => {
    if (filterQuery.trim()) {
      return filteredFiles
    }

    const result: FileItem[] = []
    let skipUntilDepth: number | null = null

    for (const file of filteredFiles) {
      if (skipUntilDepth !== null) {
        if (file.depth > skipUntilDepth) {
          continue
        }
        skipUntilDepth = null
      }

      result.push(file)

      if (file.icon === "folder" && collapsedFolders[file.label]) {
        skipUntilDepth = file.depth
      }
    }

    return result
  }, [filteredFiles, collapsedFolders, filterQuery])

  // Outline symbols of active tab
  const activeSymbols = useMemo(() => {
    const code = fileBuffers[currentTab]?.content
    return extractSymbols(code)
  }, [fileBuffers, currentTab])

  function handleCreateSubmit() {
    const name = createName.trim()
    if (name && creatingType) {
      createFile(name, creatingType === "folder")
    }
    setCreatingType(null)
    setCreateName("")
  }

  function handleRenameSubmit(oldName: string) {
    const next = renameValue.trim()
    if (next && next !== oldName) {
      renameFile(oldName, next)
    }
    setRenamingFile(null)
    setRenameValue("")
  }

  function handleRowContextMenu(e: MouseEvent, file: FileItem) {
    e.preventDefault()
    e.stopPropagation()
    // Calculate position clamped to window viewport
    const x = Math.min(e.clientX, window.innerWidth - 180)
    const y = Math.min(e.clientY, window.innerHeight - 200)
    setContextMenu({ x, y, file })
  }

  function handleCopyFullPath(file: FileItem) {
    const fullPath = `/Users/aditwicaksono/Documents/Project-AI/AegisCodev2/${
      file.path || file.label
    }`
    navigator.clipboard?.writeText(fullPath)
    showToast(`Copied full path: ${fullPath}`)
    setContextMenu(null)
  }

  function handleCopyRelativePath(file: FileItem) {
    const relPath = file.path || file.label
    navigator.clipboard?.writeText(relPath)
    showToast(`Copied relative path: ${relPath}`)
    setContextMenu(null)
  }

  function handleCopyName(file: FileItem) {
    navigator.clipboard?.writeText(file.label)
    showToast(`Copied: ${file.label}`)
    setContextMenu(null)
  }

  function triggerRename(file: FileItem) {
    setRenamingFile(file.label)
    setRenameValue(file.label)
    setContextMenu(null)
  }

  function triggerDelete(file: FileItem) {
    deleteFile(file.label)
    setContextMenu(null)
  }

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

      {/* Workspace Header with CRUD Action Bar */}
      <div className="section-title-bar">
        <button
          className="section-title section-title-clickable flex-1"
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

        <div className="section-actions">
          <button
            className="action-icon-btn"
            onClick={() => {
              setCreatingType("file")
              setCreateName("")
              setWorkspaceOpen(true)
            }}
            title="New File"
            type="button"
          >
            <Icon name="code" size={13} />
          </button>
          <button
            className="action-icon-btn"
            onClick={() => {
              setCreatingType("folder")
              setCreateName("")
              setWorkspaceOpen(true)
            }}
            title="New Folder"
            type="button"
          >
            <Icon name="folder" size={13} />
          </button>
          <button
            className={`action-icon-btn ${filterActive ? "btn-active" : ""}`}
            onClick={() => {
              setFilterActive((prev) => !prev)
              if (filterActive) setFilterQuery("")
            }}
            title="Filter Files"
            type="button"
          >
            <Icon name="search" size={12} />
          </button>
          <button
            className="action-icon-btn"
            onClick={() => {
              const resetState: Record<string, boolean> = {}
              files.forEach((f) => {
                if (f.icon === "folder" && f.open === false) {
                  resetState[f.label] = true
                }
              })
              setCollapsedFolders(resetState)
              showToast("Explorer refreshed")
            }}
            title="Refresh Explorer"
            type="button"
          >
            <Icon name="refresh" size={12} />
          </button>
        </div>
      </div>

      {/* Explorer Quick Filter Bar */}
      {workspaceOpen && filterActive && (
        <div className="explorer-filter-bar">
          <Icon name="search" size={11} />
          <input
            autoFocus
            className="explorer-filter-input"
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter files by name..."
            value={filterQuery}
          />
          {filterQuery && (
            <button
              className="filter-clear-btn"
              onClick={() => setFilterQuery("")}
              type="button"
            >
              <Icon name="close" size={10} />
            </button>
          )}
        </div>
      )}

      {workspaceOpen && (
        <div className="file-tree">
          {/* Inline creation input row */}
          {creatingType && (
            <div
              className="file-row file-create-row"
              style={{ paddingLeft: "24px" }}
            >
              <span
                className={
                  creatingType === "folder" ? "folder-icon" : "file-icon"
                }
              >
                <Icon
                  name={creatingType === "folder" ? "folder" : "code"}
                  size={14}
                />
              </span>
              <input
                autoFocus
                className="inline-input"
                onBlur={handleCreateSubmit}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSubmit()
                  if (e.key === "Escape") setCreatingType(null)
                }}
                placeholder={
                  creatingType === "folder" ? "folder-name" : "filename.ts"
                }
                value={createName}
              />
            </div>
          )}

          {visibleFiles.map((file) => {
            const isCurrent = currentTab === file.label
            const isHidden = file.label.startsWith(".") || file.muted
            const isRenaming = renamingFile === file.label
            const isFolder = file.icon === "folder"
            const isCollapsed = Boolean(collapsedFolders[file.label])

            return (
              <div
                className={`file-row ${isCurrent ? "file-active" : ""} ${
                  isHidden ? "file-muted" : ""
                }`}
                key={file.label}
                onClick={() => {
                  if (isRenaming) return
                  if (isFolder) {
                    toggleFolder(file.label)
                  } else {
                    openFileInGroup(file.label, focusedGroup)
                  }
                }}
                onContextMenu={(e) => handleRowContextMenu(e, file)}
                style={{ paddingLeft: `${10 + file.depth * 14}px` }}
              >
                {/* Visual tree branching indent guidelines */}
                {file.depth > 0 && (
                  <div className="tree-indent-guides" aria-hidden="true">
                    {Array.from({ length: file.depth }).map((_, d) => {
                      const isDirectParent = d === file.depth - 1
                      const leftPos = 16 + d * 14
                      return (
                        <span key={d} className="tree-indent-col">
                          <span
                            className="tree-indent-guide"
                            style={{ left: `${leftPos}px` }}
                          />
                          {isDirectParent && (
                            <span
                              className="tree-branch-tick"
                              style={{ left: `${leftPos}px` }}
                            />
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}

                {isFolder ? (
                  <span
                    className={`folder-chevron ${
                      !isCollapsed ? "chevron-open" : "chevron-closed"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFolder(file.label)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Icon name="chevron" size={12} />
                  </span>
                ) : (
                  <span className="tree-spacer" />
                )}
                <span className={isFolder ? "folder-icon" : "file-icon"}>
                  <Icon name={file.icon} size={14} />
                </span>

                {isRenaming ? (
                  <input
                    autoFocus
                    className="inline-input"
                    onBlur={() => handleRenameSubmit(file.label)}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(file.label)
                      if (e.key === "Escape") setRenamingFile(null)
                    }}
                    value={renameValue}
                  />
                ) : (
                  <span className="file-name-label">{file.label}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          className="explorer-context-menu"
          ref={menuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <div className="context-menu-header">{contextMenu.file.label}</div>
          <button
            className="context-menu-item"
            onClick={() => handleCopyName(contextMenu.file)}
            type="button"
          >
            <Icon name="code" size={12} />
            <span>Copy Name</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => handleCopyRelativePath(contextMenu.file)}
            type="button"
          >
            <Icon name="file" size={12} />
            <span>Copy Relative Path</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => handleCopyFullPath(contextMenu.file)}
            type="button"
          >
            <Icon name="folder" size={12} />
            <span>Copy Full Path</span>
          </button>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item"
            onClick={() => triggerRename(contextMenu.file)}
            type="button"
          >
            <Icon name="edit" size={12} />
            <span>Rename</span>
          </button>
          <button
            className="context-menu-item item-danger"
            onClick={() => triggerDelete(contextMenu.file)}
            type="button"
          >
            <Icon name="close" size={12} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Interactive OUTLINE Section (Bonus) */}
      <div className="outline-section">
        <button
          className="section-title section-title-clickable"
          onClick={() => setOutlineOpen((v) => !v)}
          type="button"
        >
          <span
            className={`chevron-arrow ${outlineOpen ? "chevron-open" : ""}`}
          >
            <Icon name="chevron" size={12} />
          </span>
          <span>OUTLINE</span>
          <small className="outline-tab-label">{currentTab}</small>
        </button>

        {outlineOpen && (
          <div className="outline-list">
            {activeSymbols.length > 0 ? (
              activeSymbols.map((sym) => (
                <button
                  className="outline-item"
                  key={`${sym.name}-${sym.line}`}
                  onClick={() => {
                    openFileInGroup(currentTab, focusedGroup)
                    setCursorPosition({ line: sym.line, col: 1 })
                    showToast(`Jumped to ${sym.name} (line ${sym.line})`)
                  }}
                  type="button"
                >
                  <span className="symbol-badge">
                    <Icon name="symbol" size={11} />
                  </span>
                  <span className="symbol-name">{sym.name}</span>
                  <span className={`symbol-kind symbol-${sym.kind}`}>
                    {sym.kind}
                  </span>
                  <span className="symbol-line">:{sym.line}</span>
                </button>
              ))
            ) : (
              <div className="outline-empty">No symbols detected in file</div>
            )}
          </div>
        )}
      </div>

      {/* TIMELINE Section */}
      <button
        className="collapsed-section section-title-clickable"
        onClick={() => setTimelineOpen((v) => !v)}
        type="button"
      >
        <span className={`chevron-arrow ${timelineOpen ? "chevron-open" : ""}`}>
          <Icon name="chevron" size={12} />
        </span>
        <span>TIMELINE</span>
      </button>
      {timelineOpen && (
        <div className="timeline-content">
          <div className="timeline-item">
            <span className="timeline-dot" />
            <div className="timeline-details">
              <strong>Local File History</strong>
              <small>Workspace changes tracked in real-time</small>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

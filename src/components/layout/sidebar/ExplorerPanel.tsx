import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import type {
  FileItem,
  GitCommitNode,
  OutlineSymbol,
} from "../../../types/workbench"
import {
  buildExplorerGitDecorations,
  normalizePath,
} from "../../../utils/explorerGitStatus"

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
      symbols.push({
        id: `fn-${idx}`,
        name: fnMatch[1],
        kind: "function",
        line: lineNum,
      })
      return
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_$]+)/)
    if (classMatch) {
      symbols.push({
        id: `cls-${idx}`,
        name: classMatch[1],
        kind: "class",
        line: lineNum,
      })
      return
    }

    const ifaceMatch = trimmed.match(
      /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
    )
    if (ifaceMatch) {
      symbols.push({
        id: `iface-${idx}`,
        name: ifaceMatch[1],
        kind: "interface",
        line: lineNum,
      })
      return
    }

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)/)
    if (typeMatch) {
      symbols.push({
        id: `type-${idx}`,
        name: typeMatch[1],
        kind: "type",
        line: lineNum,
      })
      return
    }

    const arrowFnMatch = trimmed.match(
      /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
    )
    if (arrowFnMatch) {
      symbols.push({
        id: `arrow-${idx}`,
        name: arrowFnMatch[1],
        kind: "function",
        line: lineNum,
      })
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

export function matchesExcludePattern(
  filePath: string,
  label: string,
  pattern: string,
): boolean {
  if (!pattern) return false
  const trimmed = pattern.trim()
  if (!trimmed) return false

  // 1. Extension wildcard matching: e.g. "*.log", "*.tmp", "**/*.log"
  if (trimmed.startsWith("*.") || trimmed.startsWith("**/*.")) {
    const ext = trimmed.slice(trimmed.lastIndexOf("."))
    if (label.endsWith(ext) || filePath.endsWith(ext)) {
      return true
    }
  }

  // 2. Cleaned folder / name matching: e.g. "**/node_modules/**" -> "node_modules"
  const clean = trimmed
    .replace(/^\*\*\//, "")
    .replace(/\/\*\*$/, "")
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")

  if (clean && (filePath.includes(clean) || label === clean)) {
    return true
  }

  // 3. Simple glob-to-regex fallback: '*' matches within path segments, '**' matches across path segments
  try {
    const escaped = trimmed
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ".*")
      .replace(/(?<!\.)\*/g, "[^/]*")
    const regex = new RegExp(`(^|/)${escaped}($|/)`)
    if (regex.test(filePath) || regex.test(label)) {
      return true
    }
  } catch {
    // Fallback on regex failure
  }

  return false
}

export function ExplorerPanel() {
  const {
    files,
    createFile,
    renameFile,
    deleteFile,
    moveFile,
    rootWorkspaceName,
    rootWorkspacePath,
    openRootFolder,
    refreshWorkspace,
    isWorkspaceLoading,
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
    recentProjects,
    removeRecentProject,
    clearRecentProjects,
    fetchTimeline,
    isGitRepo,
    gitCommits,
    openGitDiff,
    gitChanges,
    stagedChanges,
    settings,
  } = useWorkbench()

  const { gitStatusMap, dirtyFoldersSet } = useMemo(
    () => buildExplorerGitDecorations(stagedChanges, gitChanges),
    [stagedChanges, gitChanges],
  )

  const timelineMaxVisible = settings?.features?.timeline?.maxVisibleItems ?? 30

  const [openEditorsOpen, setOpenEditorsOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [timelineCommits, setTimelineCommits] = useState<GitCommitNode[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const activeEditorFile =
    focusedGroup === "group1" ? group1.activeTab : group2.activeTab

  useEffect(() => {
    if (!timelineOpen || !isGitRepo) return
    let isMounted = true
    setTimelineLoading(true)

    fetchTimeline(activeEditorFile || "", timelineMaxVisible)
      .then((res) => {
        if (isMounted) {
          const list =
            res.length > 0 ? res : gitCommits.slice(0, timelineMaxVisible)
          setTimelineCommits(list.slice(0, timelineMaxVisible))
          setTimelineLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setTimelineCommits(gitCommits.slice(0, timelineMaxVisible))
          setTimelineLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [
    activeEditorFile,
    fetchTimeline,
    gitCommits,
    isGitRepo,
    timelineOpen,
    timelineMaxVisible,
  ])

  // Drag and Drop target highlight state
  const [dragTarget, setDragTarget] = useState<string | null>(null)

  // Delete confirmation modal state
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<FileItem | null>(null)

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

  // Close context menu on outside click, scroll, resize, or escape
  useEffect(() => {
    function handleDismiss(e: MouseEvent | Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null)
    }
    function handleWindowResize() {
      setContextMenu(null)
    }

    window.addEventListener("click", handleDismiss)
    window.addEventListener("contextmenu", handleDismiss)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("scroll", handleDismiss, true)
    window.addEventListener("resize", handleWindowResize)
    return () => {
      window.removeEventListener("click", handleDismiss)
      window.removeEventListener("contextmenu", handleDismiss)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("scroll", handleDismiss, true)
      window.removeEventListener("resize", handleWindowResize)
    }
  }, [])

  // Collapsed folders state
  const [collapsedFolders, setCollapsedFolders] =
    useState<Record<string, boolean>>(() => {
      const initial: Record<string, boolean> = {}
      files.forEach((f) => {
        if ((f.icon === "folder" || f.type === "folder") && f.open === false) {
          const key = f.path || f.label
          initial[key] = true
          initial[f.label] = true
        }
      })
      return initial
    })

  function toggleFolder(folderKey: string) {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }))
  }

  const handleCollapseAllFolders = useCallback(() => {
    const allCollapsed: Record<string, boolean> = {}
    files.forEach((f) => {
      if (f.icon === "folder" || f.type === "folder") {
        allCollapsed[f.path || f.label] = true
        allCollapsed[f.label] = true
      }
    })
    setCollapsedFolders(allCollapsed)
  }, [files])

  const excludePatterns = settings?.files?.exclude ?? []

  const isExcluded = useCallback(
    (filePath: string, label: string) => {
      if (!excludePatterns || excludePatterns.length === 0) return false
      for (const pattern of excludePatterns) {
        if (matchesExcludePattern(filePath, label, pattern)) {
          return true
        }
      }
      return false
    },
    [excludePatterns],
  )

  // Visible files with hierarchical folder collapse pruning
  const visibleFiles = useMemo(() => {
    const result: FileItem[] = []
    let skipUntilDepth: number | null = null

    for (const file of files) {
      if (skipUntilDepth !== null) {
        if (file.depth > skipUntilDepth) {
          continue
        }
        skipUntilDepth = null
      }

      if (isExcluded(file.path, file.label)) {
        if (file.icon === "folder" || file.type === "folder") {
          skipUntilDepth = file.depth
        }
        continue
      }

      result.push(file)

      const key = file.path || file.label
      if (
        (file.icon === "folder" || file.type === "folder") &&
        (collapsedFolders[key] ?? collapsedFolders[file.label])
      ) {
        skipUntilDepth = file.depth
      }
    }

    return result
  }, [files, collapsedFolders, isExcluded])

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
    // Calculate position clamped securely to window viewport
    const menuWidth = 180
    const menuHeight = 210
    const winWidth = typeof window !== "undefined" ? window.innerWidth : 1280
    const winHeight = typeof window !== "undefined" ? window.innerHeight : 800
    const x = Math.max(8, Math.min(e.clientX, winWidth - menuWidth - 8))
    const y = Math.max(8, Math.min(e.clientY, winHeight - menuHeight - 8))
    setContextMenu({ x, y, file })
  }

  function handleCopyFullPath(file: FileItem) {
    const fullPath = rootWorkspacePath
      ? `${rootWorkspacePath}/${file.path || file.label}`
      : file.path || file.label
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
    setRenamingFile(file.path || file.label)
    setRenameValue(file.label)
    setContextMenu(null)
  }

  function triggerDelete(file: FileItem) {
    setDeleteConfirmTarget(file)
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
          className="section-title section-title-clickable min-w-0 flex-1"
          onClick={() => setWorkspaceOpen((v) => !v)}
          title={workspaceOpen ? "Collapse folder tree" : "Expand folder tree"}
          type="button"
        >
          <span
            className={`chevron-arrow ${workspaceOpen ? "chevron-open" : ""}`}
          >
            <Icon name="chevron" size={12} />
          </span>
          <span
            className="truncate text-[10px] font-bold text-[var(--color-ink)]"
            title={rootWorkspacePath || "AegisCode"}
          >
            {(rootWorkspaceName || "NO FOLDER OPENED").toUpperCase()}
          </span>
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
            <Icon name="plus" size={13} />
          </button>
          <button
            className="action-icon-btn"
            onClick={() => {
              refreshWorkspace()
            }}
            title="Refresh Explorer"
            type="button"
          >
            <Icon name="refresh" size={12} />
          </button>
          <button
            className="action-icon-btn"
            onClick={handleCollapseAllFolders}
            title="Collapse Folders in Explorer"
            type="button"
          >
            <Icon name="collapse-all" size={13} />
          </button>
        </div>
      </div>

      {workspaceOpen && (
        <div
          className="file-tree"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragTarget(null)
            try {
              const data = JSON.parse(
                e.dataTransfer.getData("application/json"),
              )
              if (data?.path) {
                moveFile(data.path, "")
              }
            } catch {}
          }}
        >
          {visibleFiles.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-[11px] text-[var(--color-ink-muted)] mb-2">
                {isWorkspaceLoading
                  ? "Scanning workspace..."
                  : rootWorkspacePath
                    ? "This folder is empty."
                    : "No folder opened."}
              </p>
              {!rootWorkspacePath && (
                <p className="text-[10px] text-[var(--color-ink-muted)]">
                  Use{" "}
                  <span className="text-[var(--color-ink)] font-medium">
                    File ➔ Open Folder…
                  </span>{" "}
                  to open a project
                </p>
              )}

              {recentProjects.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--color-line)] text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                      Recent Projects
                    </span>
                    <button
                      className="text-[10px] text-[var(--color-ink-muted)] hover:text-red-400 transition-colors"
                      onClick={clearRecentProjects}
                      title="Clear recent projects list"
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {recentProjects.map((p) => {
                      const base = p.split("/").filter(Boolean).pop() || p
                      return (
                        <div
                          className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--color-surface-raised)] cursor-pointer text-xs transition-colors"
                          key={p}
                          onClick={() => openRootFolder(p)}
                          title={p}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[var(--color-accent)] shrink-0">
                              <Icon name="folder" size={12} />
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[var(--color-ink)] truncate font-medium">
                                {base}
                              </span>
                              <span className="text-[10px] text-[var(--color-ink-muted)] truncate font-mono">
                                {p}
                              </span>
                            </div>
                          </div>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-ink-muted)] hover:text-red-400 shrink-0 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeRecentProject(p)
                            }}
                            title="Remove from recent"
                            type="button"
                          >
                            <Icon name="close" size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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
            const fileKey = file.path || file.label
            const isCurrent =
              currentTab === file.label || currentTab === file.path
            const isHidden = file.label.startsWith(".") || file.muted
            const isRenaming = renamingFile === fileKey
            const isFolder = file.icon === "folder" || file.type === "folder"
            const isCollapsed = Boolean(
              collapsedFolders[fileKey] ?? collapsedFolders[file.label],
            )
            const isDropTarget = dragTarget === fileKey
            const isContextTarget =
              contextMenu?.file != null &&
              (contextMenu.file.path || contextMenu.file.label) === fileKey

            const cleanKey = normalizePath(file.path || file.label || "")
            const isDirtyFolder =
              isFolder &&
              (dirtyFoldersSet.has(cleanKey) ||
                dirtyFoldersSet.has(normalizePath(file.label)))
            const statusBadge = !isFolder
              ? gitStatusMap.get(cleanKey) ||
                gitStatusMap.get(normalizePath(file.label))
              : null

            return (
              <div
                className={`file-row ${isCurrent ? "file-active" : ""} ${
                  isContextTarget ? "file-context-active" : ""
                } ${isHidden ? "file-muted" : ""} ${
                  isDropTarget ? "file-drop-target" : ""
                }`}
                draggable={!isRenaming}
                key={fileKey}
                onClick={() => {
                  if (isRenaming) return
                  if (isFolder) {
                    toggleFolder(fileKey)
                  } else {
                    openFileInGroup(fileKey, focusedGroup)
                  }
                }}
                onContextMenu={(e) => handleRowContextMenu(e, file)}
                onDragLeave={() => {
                  if (dragTarget === fileKey) setDragTarget(null)
                }}
                onDragOver={(e) => {
                  if (isFolder) {
                    e.preventDefault()
                    e.stopPropagation()
                    setDragTarget(fileKey)
                  }
                }}
                onDragStart={(e) => {
                  if (isRenaming) return
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ path: fileKey, isFolder }),
                  )
                  e.dataTransfer.effectAllowed = "move"
                }}
                onDrop={(e) => {
                  if (!isFolder) return
                  e.preventDefault()
                  e.stopPropagation()
                  setDragTarget(null)
                  try {
                    const data = JSON.parse(
                      e.dataTransfer.getData("application/json"),
                    )
                    if (data?.path && data.path !== fileKey) {
                      moveFile(data.path, fileKey)
                    }
                  } catch {}
                }}
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
                      toggleFolder(fileKey)
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
                    onBlur={() => handleRenameSubmit(fileKey)}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(fileKey)
                      if (e.key === "Escape") setRenamingFile(null)
                    }}
                    value={renameValue}
                  />
                ) : (
                  <>
                    <span className="file-name-label flex-1 truncate">
                      {file.label}
                    </span>
                    {isFolder && isDirtyFolder && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 ml-auto mr-1"
                        title="Folder contains modified files"
                        aria-label="Folder contains modified files"
                      />
                    )}
                    {!isFolder && statusBadge && (
                      <span
                        className={`ml-auto shrink-0 font-mono text-[10px] font-bold px-1 ${statusBadge.colorClass}`}
                        title={statusBadge.title}
                        aria-label={`Git status: ${statusBadge.title}`}
                      >
                        {statusBadge.code}
                      </span>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Context Menu */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
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
          </div>,
          document.body,
        )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget &&
        createPortal(
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setDeleteConfirmTarget(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDeleteConfirmTarget(null)
            }}
            role="dialog"
          >
            <div
              className="w-full max-w-sm rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-surface-raised)] p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-error)]/20 text-[var(--color-error)] shrink-0 mt-0.5">
                  <Icon name="warning" size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                    Delete{" "}
                    {deleteConfirmTarget.type === "folder" ? "Folder" : "File"}?
                  </h3>
                  <p className="text-xs text-[var(--color-ink-muted)] mt-1 leading-relaxed">
                    Are you sure you want to permanently delete{" "}
                    <strong className="text-[var(--color-ink)] font-mono">
                      {deleteConfirmTarget.label}
                    </strong>
                    ? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-line)]">
                <button
                  autoFocus
                  className="px-3 py-1.5 text-xs font-medium rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-soft)] transition-colors cursor-pointer"
                  onClick={() => setDeleteConfirmTarget(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--color-error)] text-white hover:opacity-90 transition-opacity cursor-pointer"
                  onClick={() => {
                    deleteFile(
                      deleteConfirmTarget.path || deleteConfirmTarget.label,
                    )
                    setDeleteConfirmTarget(null)
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
        {activeEditorFile && (
          <span className="ml-auto text-[10px] text-[var(--color-ink-muted)] truncate max-w-[120px] font-normal">
            {activeEditorFile}
          </span>
        )}
      </button>
      {timelineOpen && (
        <div className="timeline-content p-2">
          {!isGitRepo ? (
            <div className="p-3 text-center text-[11px] text-[var(--color-ink-muted)]">
              No Git repository detected.
            </div>
          ) : timelineLoading ? (
            <div className="flex items-center justify-center p-3 text-[11px] text-[var(--color-ink-muted)]">
              <span className="animate-spin mr-2">
                <Icon name="refresh" size={12} />
              </span>
              Loading history...
            </div>
          ) : timelineCommits.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-[var(--color-ink-muted)]">
              {activeEditorFile
                ? `No commits found for ${activeEditorFile}`
                : "Open a file to view commit timeline."}
            </div>
          ) : (
            <div className="space-y-1">
              {timelineCommits.map((item) => (
                <div
                  className="group flex items-start gap-2 p-1.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                  key={item.hash}
                  onClick={() => {
                    if (activeEditorFile) {
                      openGitDiff(activeEditorFile, false, item.hash)
                    } else {
                      navigator.clipboard?.writeText(item.hash)
                      showToast(
                        `Copied commit hash [${item.shortHash || item.hash.slice(0, 7)}]`,
                      )
                    }
                  }}
                  title={
                    activeEditorFile
                      ? "Click to open comparison in editor"
                      : "Click to copy hash"
                  }
                >
                  <span className="mt-1 w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                        {item.shortHash || item.hash.slice(0, 7)}
                      </span>
                      <span className="text-[10px] text-[var(--color-ink-muted)]">
                        {item.timestamp}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-[var(--color-ink)] truncate mt-0.5">
                      {item.message}
                    </p>
                    <p className="text-[10px] text-[var(--color-ink-soft)] truncate">
                      {item.author}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

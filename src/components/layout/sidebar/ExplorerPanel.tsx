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
import { useWorkbenchStore, useShallow } from "@/store"
import type {
  FileItem,
  GitCommitNode,
  OutlineSymbol,
} from "../../../types/workbench"
import {
  buildExplorerGitDecorations,
  normalizePath,
} from "../../../utils/explorerGitStatus"
import { sortFileTree } from "../../../utils/workspaceApi"

export function extractSymbols(code?: string): OutlineSymbol[] {
  if (!code) return []
  const symbols: OutlineSymbol[] = []
  const lines = code.split("\n")

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("#")
    ) {
      return
    }

    // 1. Go functions & receiver methods: func (r *Recv) Name(...) or func Name(...)
    const goFuncMatch = trimmed.match(
      /^func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*\(/,
    )
    if (goFuncMatch) {
      symbols.push({
        id: `go-fn-${idx}`,
        name: goFuncMatch[1],
        kind: "function",
        line: lineNum,
      })
      return
    }

    // 2. Go struct / interface / type definitions: type Name struct | interface | ...
    const goTypeMatch = trimmed.match(
      /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)\b/,
    )
    if (goTypeMatch) {
      symbols.push({
        id: `go-type-${idx}`,
        name: goTypeMatch[1],
        kind: goTypeMatch[2] === "interface" ? "interface" : "class",
        line: lineNum,
      })
      return
    }

    // 3. Python functions & classes: def name(...) / async def name(...) / class Name...
    const pyFuncMatch = trimmed.match(
      /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    )
    if (pyFuncMatch) {
      symbols.push({
        id: `py-fn-${idx}`,
        name: pyFuncMatch[1],
        kind: "function",
        line: lineNum,
      })
      return
    }

    const pyClassMatch = trimmed.match(
      /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/,
    )
    if (pyClassMatch) {
      symbols.push({
        id: `py-cls-${idx}`,
        name: pyClassMatch[1],
        kind: "class",
        line: lineNum,
      })
      return
    }

    // 4. TS/JS functions, classes, interfaces, types, arrow functions
    const fnMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
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

    const classMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/,
    )
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
      /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>)?\s*(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
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

const FILE_ROW_HEIGHT = 24
const VIRTUAL_OVERSCAN = 8

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
    closeAllTabs,
    dirtyFiles,
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
  } = useWorkbenchStore(
    useShallow((s) => ({
      files: s.files,
      createFile: s.createFile,
      renameFile: s.renameFile,
      deleteFile: s.deleteFile,
      moveFile: s.moveFile,
      rootWorkspaceName: s.rootWorkspaceName,
      rootWorkspacePath: s.rootWorkspacePath,
      openRootFolder: s.openRootFolder,
      refreshWorkspace: s.refreshWorkspace,
      isWorkspaceLoading: s.isWorkspaceLoading,
      group1: s.group1,
      group2: s.group2,
      focusedGroup: s.focusedGroup,
      splitEditor: s.splitEditor,
      openFileInGroup: s.openFileInGroup,
      setActiveTabInGroup: s.setActiveTabInGroup,
      closeTabInGroup: s.closeTabInGroup,
      closeAllTabs: s.closeAllTabs,
      dirtyFiles: s.dirtyFiles,
      setCursorPosition: s.setCursorPosition,
      showToast: s.showToast,
      recentProjects: s.recentProjects,
      removeRecentProject: s.removeRecentProject,
      clearRecentProjects: s.clearRecentProjects,
      fetchTimeline: s.fetchTimeline,
      isGitRepo: s.isGitRepo,
      gitCommits: s.gitCommits,
      openGitDiff: s.openGitDiff,
      gitChanges: s.gitChanges,
      stagedChanges: s.stagedChanges,
      settings: s.settings,
    })),
  )

  const { gitStatusMap, dirtyFoldersSet } = useMemo(
    () => buildExplorerGitDecorations(stagedChanges, gitChanges, dirtyFiles),
    [stagedChanges, gitChanges, dirtyFiles],
  )

  const timelineMaxVisible = settings?.features?.timeline?.maxVisibleItems ?? 30

  const [openEditorsOpen, setOpenEditorsOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [timelineCommits, setTimelineCommits] = useState<GitCommitNode[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [activeTimelineMenu, setActiveTimelineMenu] =
    useState<GitCommitNode | null>(null)
  const timelineMenuRef = useRef<HTMLDivElement>(null)

  const rawActiveFile =
    focusedGroup === "group1" ? group1.activeTab : group2.activeTab
  const activeEditorFile = useMemo(() => {
    if (!rawActiveFile) return ""
    const match = files.find(
      (f) =>
        f.type !== "folder" &&
        (f.path === rawActiveFile ||
          f.path?.endsWith("/" + rawActiveFile) ||
          rawActiveFile.endsWith("/" + f.path) ||
          f.name === rawActiveFile),
    )
    return match?.path || rawActiveFile
  }, [rawActiveFile, files])

  const loadTimelineData = useCallback(() => {
    if (!isGitRepo) return
    setTimelineLoading(true)
    fetchTimeline(activeEditorFile || "", timelineMaxVisible)
      .then((res) => {
        const list =
          res.length > 0 ? res : gitCommits.slice(0, timelineMaxVisible)
        setTimelineCommits(list.slice(0, timelineMaxVisible))
        setTimelineLoading(false)
      })
      .catch(() => {
        setTimelineCommits(gitCommits.slice(0, timelineMaxVisible))
        setTimelineLoading(false)
      })
  }, [
    activeEditorFile,
    fetchTimeline,
    gitCommits,
    isGitRepo,
    timelineMaxVisible,
  ])

  useEffect(() => {
    if (!timelineOpen || !isGitRepo) return
    loadTimelineData()
  }, [timelineOpen, loadTimelineData, isGitRepo])

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
  const [parentFolder, setParentFolder] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  // Guard ref for race conditions on inline create/rename blur vs Enter/Escape
  const isSubmittingRef = useRef(false)

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

  // Close context menu and timeline menu on outside click, scroll, resize, or escape
  useEffect(() => {
    function handleDismiss(e: MouseEvent | Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
      if (
        timelineMenuRef.current &&
        !timelineMenuRef.current.contains(e.target as Node)
      ) {
        setActiveTimelineMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setContextMenu(null)
        setActiveTimelineMenu(null)
      }
    }
    function handleWindowResize() {
      setContextMenu(null)
      setActiveTimelineMenu(null)
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

  // Virtualized tree scroll & viewport tracking
  const fileTreeRef = useRef<HTMLDivElement>(null)
  const [treeScrollTop, setTreeScrollTop] = useState(0)
  const [treeViewportHeight, setTreeViewportHeight] = useState(600)

  useEffect(() => {
    const container = fileTreeRef.current
    if (!container || !workspaceOpen) return

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (fileTreeRef.current) {
          setTreeScrollTop(fileTreeRef.current.scrollTop)
        }
      })
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreeViewportHeight(entry.contentRect.height)
      }
    })
    ro.observe(container)

    setTreeScrollTop(container.scrollTop)
    if (container.clientHeight) {
      setTreeViewportHeight(container.clientHeight)
    }

    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      container.removeEventListener("scroll", handleScroll)
      ro.disconnect()
    }
  }, [workspaceOpen])

  // Expanded folders state: empty by default, so all folders at all levels start collapsed
  const [expandedFolders, setExpandedFolders] =
    useState<Record<string, boolean>>({})

  // Reset all folders to collapsed when root workspace changes
  useEffect(() => {
    setExpandedFolders({})
  }, [rootWorkspacePath])

  const expandParents = useCallback((path: string) => {
    const cleanPath = path.replace(/\\/g, "/")
    if (!cleanPath.includes("/")) return
    const parts = cleanPath.split("/").slice(0, -1)
    const toExpand: Record<string, boolean> = {}
    let currentPath = ""
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      toExpand[currentPath] = true
    }
    setExpandedFolders((prev) => ({ ...prev, ...toExpand }))
  }, [])

  // Auto-expand parent folders of active editor file when opened
  useEffect(() => {
    if (activeEditorFile) {
      expandParents(activeEditorFile)
    }
  }, [activeEditorFile, expandParents])

  function toggleFolder(folderKey: string) {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }))
  }

  const handleCollapseAllFolders = useCallback(() => {
    setExpandedFolders({})
  }, [])

  useEffect(() => {
    const handleCollapse = () => setExpandedFolders({})
    window.addEventListener("aegis:explorer-collapse-all", handleCollapse)
    return () => {
      window.removeEventListener("aegis:explorer-collapse-all", handleCollapse)
    }
  }, [])

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

  const sortedFiles = useMemo(() => sortFileTree(files), [files])

  // Visible files with hierarchical folder collapse pruning
  const visibleFiles = useMemo(() => {
    const result: FileItem[] = []
    let skipUntilDepth: number | null = null

    for (const file of sortedFiles) {
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
      const isFolder = file.icon === "folder" || file.type === "folder"
      if (isFolder) {
        const isExpanded = Boolean(
          expandedFolders[key] ?? expandedFolders[file.label],
        )
        if (!isExpanded) {
          skipUntilDepth = file.depth
        }
      }
    }

    return result
  }, [sortedFiles, expandedFolders, isExcluded])

  // Virtualized file list calculation to keep DOM tree lean on large repositories (1000+ files)
  const { virtualFiles, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    const total = visibleFiles.length
    if (total <= 50) {
      return {
        virtualFiles: visibleFiles,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    let startIndex = Math.max(
      0,
      Math.floor(treeScrollTop / FILE_ROW_HEIGHT) - VIRTUAL_OVERSCAN,
    )
    const visibleCount =
      Math.ceil(treeViewportHeight / FILE_ROW_HEIGHT) + 2 * VIRTUAL_OVERSCAN
    let endIndex = Math.min(total, startIndex + visibleCount)

    if (renamingFile) {
      const renamingIndex = visibleFiles.findIndex(
        (f) => (f.path || f.label) === renamingFile,
      )
      if (renamingIndex !== -1) {
        if (renamingIndex < startIndex) startIndex = renamingIndex
        if (renamingIndex >= endIndex) endIndex = renamingIndex + 1
      }
    }

    return {
      virtualFiles: visibleFiles.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * FILE_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (total - endIndex) * FILE_ROW_HEIGHT),
    }
  }, [visibleFiles, treeScrollTop, treeViewportHeight, renamingFile])

  const [lexicalSymbols, setLexicalSymbols] = useState<OutlineSymbol[]>([])

  useEffect(() => {
    if (!outlineOpen) {
      setLexicalSymbols([])
      return
    }
    const targetKey = activeEditorFile || currentTab
    if (!targetKey) {
      setLexicalSymbols([])
      return
    }

    const computeSymbols = () => {
      const state = useWorkbenchStore.getState()
      const baseTarget = targetKey?.split("/").pop() || ""
      const baseCurrent = currentTab?.split("/").pop() || ""
      const buf =
        state.fileBuffers[targetKey] ||
        state.fileBuffers[currentTab] ||
        state.fileBuffers[baseTarget] ||
        state.fileBuffers[baseCurrent] ||
        Object.entries(state.fileBuffers).find(
          ([k]) =>
            k === targetKey ||
            k === currentTab ||
            (baseTarget && k.endsWith("/" + baseTarget)) ||
            (baseCurrent && k.endsWith("/" + baseCurrent)) ||
            k.endsWith("/" + targetKey) ||
            targetKey.endsWith("/" + k) ||
            k.endsWith("/" + currentTab) ||
            currentTab.endsWith("/" + k),
        )?.[1]
      const code = buf?.content
      setLexicalSymbols(extractSymbols(code))
    }

    computeSymbols()

    const handleContentChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ file?: string }>
      if (!customEvent.detail?.file || customEvent.detail.file === targetKey) {
        computeSymbols()
      }
    }
    window.addEventListener("aegis:file-content-debounced", handleContentChange)

    return () => {
      window.removeEventListener(
        "aegis:file-content-debounced",
        handleContentChange,
      )
    }
  }, [outlineOpen, activeEditorFile, currentTab, dirtyFiles])

  // Outline symbols of active tab
  const activeSymbols = lexicalSymbols

  const handleCreateSubmit = useCallback(() => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const name = createName.trim()
    if (name && creatingType) {
      const cleanParent = parentFolder ? parentFolder.replace(/\/+$/, "") : ""
      let finalName = name
      if (cleanParent && !name.startsWith(cleanParent + "/")) {
        finalName = `${cleanParent}/${name.replace(/^\/+/, "")}`
      }
      createFile(finalName, creatingType === "folder")
      expandParents(finalName)
    }
    setCreatingType(null)
    setCreateName("")
    setParentFolder(null)

    setTimeout(() => {
      isSubmittingRef.current = false
    }, 50)
  }, [createName, creatingType, parentFolder, createFile, expandParents])

  const handleCreateCancel = useCallback(() => {
    isSubmittingRef.current = true
    setCreatingType(null)
    setCreateName("")
    setParentFolder(null)
    setTimeout(() => {
      isSubmittingRef.current = false
    }, 50)
  }, [])

  const handleRenameSubmit = useCallback(
    (oldName: string) => {
      if (isSubmittingRef.current) return
      isSubmittingRef.current = true

      const next = renameValue.trim()
      if (next && next !== oldName) {
        renameFile(oldName, next)
      }
      setRenamingFile(null)
      setRenameValue("")

      setTimeout(() => {
        isSubmittingRef.current = false
      }, 50)
    },
    [renameValue, renameFile],
  )

  const handleRenameCancel = useCallback(() => {
    isSubmittingRef.current = true
    setRenamingFile(null)
    setRenameValue("")
    setTimeout(() => {
      isSubmittingRef.current = false
    }, 50)
  }, [])

  function handleRowContextMenu(e: MouseEvent, file: FileItem) {
    e.preventDefault()
    e.stopPropagation()
    const isFolder = file.type === "folder" || file.icon === "folder"
    const menuWidth = 180
    const menuHeight = isFolder ? 270 : 210
    const winWidth = typeof window !== "undefined" ? window.innerWidth : 1280
    const winHeight = typeof window !== "undefined" ? window.innerHeight : 800
    const x = Math.max(8, Math.min(e.clientX, winWidth - menuWidth - 8))
    const y = Math.max(8, Math.min(e.clientY, winHeight - menuHeight - 8))
    setContextMenu({ x, y, file })
  }

  function handleContextMenuCreate(type: "file" | "folder", folder: FileItem) {
    const folderPath = folder.path || folder.label
    isSubmittingRef.current = false
    setParentFolder(folderPath)
    setSelectedFolder(folderPath)
    setCreatingType(type)
    setCreateName("")
    setWorkspaceOpen(true)
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: true }))
    setContextMenu(null)
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
    isSubmittingRef.current = false
    setRenamingFile(file.path || file.label)
    setRenameValue(file.label)
    setContextMenu(null)
  }

  function triggerDelete(file: FileItem) {
    setDeleteConfirmTarget(file)
    setContextMenu(null)
  }

  return (
    <div className="explorer-panel">
      {/* OPEN EDITORS Section */}
      <div className="section-title-bar">
        <button
          className="section-title section-title-clickable min-w-0 flex-1"
          onClick={() => setOpenEditorsOpen((v) => !v)}
          title={
            openEditorsOpen ? "Collapse Open Editors" : "Expand Open Editors"
          }
          type="button"
        >
          <span
            className={`chevron-arrow ${openEditorsOpen ? "chevron-open" : ""}`}
          >
            <Icon name="chevron" size={12} />
          </span>
          <span>OPEN EDITORS</span>
        </button>

        {openEditorsOpen &&
          (group1.tabs.length > 0 || group2.tabs.length > 0) && (
            <div className="section-actions">
              <button
                className="action-icon-btn"
                onClick={() => closeAllTabs()}
                title="Close All Editors"
                type="button"
              >
                <Icon name="close-all" size={13} />
              </button>
            </div>
          )}
      </div>

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
                <div className="flex items-center gap-1.5 ml-auto">
                  <small>{group1.tabs.length}</small>
                  {group1.tabs.length > 0 && (
                    <button
                      className="action-icon-btn p-0.5 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeAllTabs("group1")
                      }}
                      title="Close All in Group 1"
                      type="button"
                    >
                      <Icon name="close" size={10} />
                    </button>
                  )}
                </div>
              </div>
              {group1.tabs.map((tab) => {
                const isActive =
                  tab === group1.activeTab && focusedGroup === "group1"
                const isDirty = Boolean(dirtyFiles[tab])
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
                <div className="flex items-center gap-1.5 ml-auto">
                  <small>{group2.tabs.length}</small>
                  {group2.tabs.length > 0 && (
                    <button
                      className="action-icon-btn p-0.5 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeAllTabs("group2")
                      }}
                      title="Close All in Group 2"
                      type="button"
                    >
                      <Icon name="close" size={10} />
                    </button>
                  )}
                </div>
              </div>
              {group2.tabs.map((tab) => {
                const isActive =
                  tab === group2.activeTab && focusedGroup === "group2"
                const isDirty = Boolean(dirtyFiles[tab])
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
              const isDirty = Boolean(dirtyFiles[tab])
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
              isSubmittingRef.current = false
              setParentFolder(selectedFolder)
              if (selectedFolder) {
                setExpandedFolders((prev) => ({
                  ...prev,
                  [selectedFolder]: true,
                }))
              }
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
              isSubmittingRef.current = false
              setParentFolder(selectedFolder)
              if (selectedFolder) {
                setExpandedFolders((prev) => ({
                  ...prev,
                  [selectedFolder]: true,
                }))
              }
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
          ref={fileTreeRef}
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
              style={{
                paddingLeft: `${
                  24 +
                  (parentFolder
                    ? ((files.find((f) => (f.path || f.label) === parentFolder)
                        ?.depth ?? -1) +
                        1) *
                      14
                    : 0)
                }px`,
              }}
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
                onBlur={() => {
                  if (!isSubmittingRef.current) {
                    handleCreateSubmit()
                  }
                }}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateSubmit()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    handleCreateCancel()
                  }
                }}
                placeholder={
                  parentFolder
                    ? `${parentFolder}/${
                        creatingType === "folder"
                          ? "folder-name"
                          : "filename.ts"
                      }`
                    : creatingType === "folder"
                      ? "folder-name"
                      : "filename.ts"
                }
                value={createName}
              />
            </div>
          )}

          {topSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              style={{ height: `${topSpacerHeight}px`, flexShrink: 0 }}
            />
          )}

          {virtualFiles.map((file) => {
            const fileKey = file.path || file.label
            const isCurrent =
              currentTab === file.label || currentTab === file.path
            const isHidden = file.label.startsWith(".") || file.muted
            const isRenaming = renamingFile === fileKey
            const isFolder = file.icon === "folder" || file.type === "folder"
            const isExpanded = Boolean(
              expandedFolders[fileKey] ?? expandedFolders[file.label],
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

            const isSelected = selectedFolder === fileKey

            return (
              <div
                className={`file-row ${isCurrent ? "file-active" : ""} ${
                  isContextTarget ? "file-context-active" : ""
                } ${isSelected ? "file-selected" : ""} ${
                  isHidden ? "file-muted" : ""
                } ${isDropTarget ? "file-drop-target" : ""}`}
                draggable={!isRenaming}
                key={fileKey}
                onClick={() => {
                  if (isRenaming) return
                  if (isFolder) {
                    setSelectedFolder(fileKey)
                    toggleFolder(fileKey)
                  } else {
                    setSelectedFolder(null)
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
                      isExpanded ? "chevron-open" : "chevron-closed"
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
                    onBlur={() => {
                      if (!isSubmittingRef.current) {
                        handleRenameSubmit(fileKey)
                      }
                    }}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleRenameSubmit(fileKey)
                      } else if (e.key === "Escape") {
                        e.preventDefault()
                        handleRenameCancel()
                      }
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

          {bottomSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              style={{ height: `${bottomSpacerHeight}px`, flexShrink: 0 }}
            />
          )}
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
            {(contextMenu.file.type === "folder" ||
              contextMenu.file.icon === "folder") && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() =>
                    handleContextMenuCreate("file", contextMenu.file)
                  }
                  type="button"
                >
                  <Icon name="code" size={12} />
                  <span>New File</span>
                </button>
                <button
                  className="context-menu-item"
                  onClick={() =>
                    handleContextMenuCreate("folder", contextMenu.file)
                  }
                  type="button"
                >
                  <Icon name="plus" size={12} />
                  <span>New Folder</span>
                </button>
                <div className="context-menu-separator" />
              </>
            )}
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
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("aegis:editor-goto-line", {
                          detail: { file: currentTab, line: sym.line, col: 1 },
                        }),
                      )
                    }
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
      <div className="timeline-section" ref={timelineMenuRef}>
        <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors">
          <button
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer text-left min-w-0"
            onClick={() => setTimelineOpen((v) => !v)}
            type="button"
          >
            <span
              className={`chevron-arrow ${timelineOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={11} />
            </span>
            <span>TIMELINE</span>
            {activeEditorFile ? (
              <span
                className="text-[10px] text-[var(--color-ink-muted)] truncate max-w-[100px] font-mono px-1 py-0.5 rounded bg-[var(--color-surface-raised)] border border-[var(--color-line)]"
                title={activeEditorFile}
              >
                {activeEditorFile.split("/").pop() || activeEditorFile}
              </span>
            ) : null}
            {timelineCommits.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)] shrink-0">
                {timelineCommits.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              aria-label="Refresh Timeline"
              className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              disabled={timelineLoading}
              onClick={(e) => {
                e.stopPropagation()
                loadTimelineData()
              }}
              title="Refresh Timeline"
              type="button"
            >
              <span className={timelineLoading ? "animate-spin block" : ""}>
                <Icon name="refresh" size={12} />
              </span>
            </button>
          </div>
        </div>

        {timelineOpen && (
          <div className="timeline-content max-h-[220px] overflow-y-auto px-2 py-1">
            {!isGitRepo ? (
              <div className="p-3 text-center text-[11px] text-[var(--color-ink-muted)]">
                No Git repository detected.
              </div>
            ) : timelineLoading && timelineCommits.length === 0 ? (
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
              <div className="relative pl-1 py-1 space-y-1">
                {timelineCommits.map((item, idx) => {
                  const isMenuOpen = activeTimelineMenu?.hash === item.hash
                  const prevCommit = timelineCommits[idx + 1]

                  return (
                    <div
                      className={`relative group flex items-start gap-2.5 px-2 py-1.5 rounded transition-colors cursor-pointer text-left ${
                        isMenuOpen
                          ? "bg-[var(--color-surface-raised)]"
                          : "hover:bg-[var(--color-surface-hover)]"
                      }`}
                      key={item.hash || item.id || `timeline-${idx}`}
                      onClick={() => {
                        if (activeEditorFile) {
                          openGitDiff(activeEditorFile, false, item.hash)
                        } else {
                          void navigator.clipboard?.writeText(item.hash)
                          showToast(
                            `Copied commit hash [${
                              item.shortHash || item.hash.slice(0, 7)
                            }]`,
                          )
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setActiveTimelineMenu(item)
                      }}
                      title={
                        activeEditorFile
                          ? "Click to compare with working tree"
                          : "Click to copy commit hash"
                      }
                    >
                      {/* Vertical timeline track line & circular node */}
                      <div className="relative flex flex-col items-center self-stretch shrink-0 mt-0.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 z-10 transition-colors ${
                            item.isHead || idx === 0
                              ? "bg-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                              : "border border-[var(--color-ink-muted)]/50 bg-[var(--color-surface)] group-hover:border-[var(--color-accent)] group-hover:bg-[var(--color-accent)]"
                          }`}
                        />
                        {idx < timelineCommits.length - 1 && (
                          <span className="absolute top-2 bottom-[-8px] w-[1px] bg-[var(--color-line)] -translate-x-1/2 left-1/2" />
                        )}
                      </div>

                      {/* Commit details */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] text-[var(--color-ink-muted)] font-semibold">
                            {item.shortHash || item.hash.slice(0, 7)}
                          </span>
                          <span className="text-[10px] text-[var(--color-ink-muted)] shrink-0">
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

                      {/* 3-dots action menu button */}
                      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                        <button
                          aria-label="Commit actions"
                          className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveTimelineMenu((prev) =>
                              prev?.hash === item.hash ? null : item,
                            )
                          }}
                          title="More Actions"
                          type="button"
                        >
                          <Icon name="more" size={12} />
                        </button>
                      </div>

                      {/* Dropdown Menu (Contained in panel) */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-2 top-7 w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-xl py-1 z-40 text-[11px] animate-in fade-in zoom-in-95 duration-100 divide-y divide-[var(--color-line)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="py-0.5">
                            {activeEditorFile && (
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                                onClick={() => {
                                  openGitDiff(
                                    activeEditorFile,
                                    false,
                                    item.hash,
                                  )
                                  setActiveTimelineMenu(null)
                                }}
                                type="button"
                              >
                                <Icon
                                  className="text-[var(--color-accent)] shrink-0"
                                  name="split"
                                  size={12}
                                />
                                <span>Open Changes</span>
                              </button>
                            )}

                            {activeEditorFile && prevCommit && (
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                                onClick={() => {
                                  openGitDiff(
                                    activeEditorFile,
                                    false,
                                    item.hash,
                                    prevCommit.hash,
                                  )
                                  setActiveTimelineMenu(null)
                                }}
                                type="button"
                              >
                                <Icon
                                  className="text-[var(--color-accent)] shrink-0"
                                  name="split"
                                  size={12}
                                />
                                <span>Compare with Previous</span>
                              </button>
                            )}
                          </div>

                          <div className="py-0.5">
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                              onClick={() => {
                                void navigator.clipboard?.writeText(item.hash)
                                showToast(
                                  `Copied commit hash [${
                                    item.shortHash || item.hash.slice(0, 7)
                                  }]`,
                                )
                                setActiveTimelineMenu(null)
                              }}
                              type="button"
                            >
                              <Icon
                                className="text-[var(--color-ink-muted)] shrink-0"
                                name="copy"
                                size={12}
                              />
                              <span>Copy Commit Hash</span>
                            </button>

                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                              onClick={() => {
                                void navigator.clipboard?.writeText(
                                  item.message,
                                )
                                showToast("Copied commit message")
                                setActiveTimelineMenu(null)
                              }}
                              type="button"
                            >
                              <Icon
                                className="text-[var(--color-ink-muted)] shrink-0"
                                name="file"
                                size={12}
                              />
                              <span>Copy Commit Message</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  DiagnosticItem,
  FileBuffer,
  FileItem,
  LinterSettings,
  NotificationItem,
  WorkspaceChangeEvent,
} from "../../types/workbench"
import {
  initialDiagnostics,
  initialFileBuffers,
  initialFiles,
  initialNotifications,
} from "../../data/mockData"
import {
  detectLanguage,
  validateSyntax,
  isLspLanguage,
} from "../../utils/linter"
import {
  closeWorkspace,
  deleteWorkspaceFile,
  fetchFileContent,
  fetchFileDetailed,
  fetchGitStatus,
  fetchWorkspaceInfo,
  fetchWorkspaceTree,
  moveWorkspaceFile,
  openWorkspace,
  pickFolderNative,
  renameWorkspaceFile,
  saveWorkspaceFile,
  normalizeWorkspacePath,
} from "../../utils/workspaceApi"
import { subscribeLspDiagnostics } from "../../utils/lspApi"
import {
  addBackendRecentProject,
  clearBackendRecentProjects,
  fetchBackendState,
  removeBackendRecentProject,
} from "../../utils/storeApi"

// Pure state transition functions
export function addFileToTreeLogic(
  files: FileItem[],
  path: string,
  isFolder: boolean,
): FileItem[] {
  const parts = path.split("/").filter(Boolean)
  const name = parts[parts.length - 1] || path
  const id = path

  if (files.some((f) => f.path === path)) {
    return files
  }

  const newItem: FileItem = {
    id,
    name,
    label: name,
    type: isFolder ? "folder" : "file",
    icon: isFolder ? "folder" : "file",
    depth: Math.max(0, parts.length - 1),
    path,
  }

  return [...files, newItem]
}

export function removeFileFromTreeLogic(
  files: FileItem[],
  path: string,
): FileItem[] {
  return files.filter(
    (f) =>
      f.path !== path && f.name !== path && !f.path?.startsWith(path + "/"),
  )
}

export function renameFileInTreeLogic(
  files: FileItem[],
  oldPath: string,
  newPath: string,
): FileItem[] {
  const newName = newPath.split("/").pop() || newPath
  return files.map((f) => {
    if (f.path === oldPath || f.name === oldPath) {
      return {
        ...f,
        name: newName,
        path: newPath,
      }
    }
    if (f.path?.startsWith(oldPath + "/")) {
      const suffix = f.path.slice(oldPath.length)
      return {
        ...f,
        path: newPath + suffix,
      }
    }
    return f
  })
}

export function updateBufferContentLogic(
  buffers: Record<string, FileBuffer>,
  filename: string,
  content: string,
): Record<string, FileBuffer> {
  const existing = buffers[filename]
  const savedContent =
    existing?.savedContent ?? (existing ? existing.content : "")
  const isDirty = content !== savedContent
  return {
    ...buffers,
    [filename]: {
      content,
      savedContent,
      isDirty,
      language: existing?.language || detectLanguage(filename),
    },
  }
}

export function syncBufferWithDiskLogic(
  buffers: Record<string, FileBuffer>,
  filename: string,
  content: string,
): Record<string, FileBuffer> {
  const existing = buffers[filename]
  return {
    ...buffers,
    [filename]: {
      content,
      savedContent: content,
      isDirty: false,
      language: existing?.language || detectLanguage(filename),
    },
  }
}

export interface FileHygieneOptions {
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  eol?: "\n" | "\r\n"
}

export function sanitizeContentOnSave(
  content: string,
  options: FileHygieneOptions = {},
): string {
  let result = content
  const targetEol = options.eol || "\n"

  if (options.trimTrailingWhitespace) {
    result = result
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join(targetEol)
  } else if (options.eol) {
    result = result.split(/\r?\n/).join(targetEol)
  }

  if (options.insertFinalNewline && result.length > 0) {
    if (!result.endsWith(targetEol)) {
      result = result + targetEol
    }
  }

  return result
}

export function markBufferSavedLogic(
  buffers: Record<string, FileBuffer>,
  filename: string,
): Record<string, FileBuffer> {
  const currentBuf = buffers[filename]
  if (!currentBuf) return buffers
  return {
    ...buffers,
    [filename]: {
      ...currentBuf,
      savedContent: currentBuf.content,
      isDirty: false,
    },
  }
}

export function revertBufferContentLogic(
  buffers: Record<string, FileBuffer>,
  filename: string,
): Record<string, FileBuffer> {
  const currentBuf = buffers[filename]
  if (!currentBuf) return buffers
  const revertedContent = currentBuf.savedContent ?? currentBuf.content
  return {
    ...buffers,
    [filename]: {
      ...currentBuf,
      content: revertedContent,
      isDirty: false,
    },
  }
}

export { normalizeWorkspacePath }

export function loadStoredRecentProjects(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem("aegis_recent_projects_v1")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((p) => typeof p === "string" && p.trim())
          .map((p) => normalizeWorkspacePath(p))
          .filter(Boolean)
      }
    }
  } catch {}
  return []
}

export interface AsyncRequestToken {
  requestId: number
  signal: AbortSignal
}

export interface CursorCoordinates {
  line: number
  col: number
}

export interface WorkspaceGitStatus {
  isRepo: boolean
  branch: string
  repoName: string
  rootPath: string
}

export interface UseWorkspaceCoreOptions {
  onFileRenamed?: (oldPath: string, newPath: string) => void
  onFileDeleted?: (filename: string) => void
  onWorkspaceCleared?: () => void
  onGitStatusUpdated?: (repo: WorkspaceGitStatus) => void
  showToast: (msg: string) => void
  openFileInPane?: (filename: string) => void
  setCursorPosition?: (pos: CursorCoordinates) => void
  onFilesChangedOnDisk?: (evt: WorkspaceChangeEvent) => void
}

/**
 * Async Concurrency & Race Condition Guard
 * Prevents overlapping asynchronous I/O and discards out-of-order stale responses
 */
export class AsyncSequenceGuard {
  private currentRequestId = 0
  private activeController: AbortController | null = null

  nextRequest(): AsyncRequestToken {
    if (this.activeController) {
      this.activeController.abort()
    }
    this.activeController = new AbortController()
    this.currentRequestId += 1
    return {
      requestId: this.currentRequestId,
      signal: this.activeController.signal,
    }
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.currentRequestId
  }

  cancelActive(): void {
    if (this.activeController) {
      this.activeController.abort()
      this.activeController = null
    }
  }
}

export function useWorkspaceCore(options: UseWorkspaceCoreOptions) {
  const {
    onFileRenamed,
    onFileDeleted,
    onWorkspaceCleared,
    onGitStatusUpdated,
    showToast,
    openFileInPane,
    setCursorPosition,
    onFilesChangedOnDisk,
  } = options

  const [rootWorkspacePath, setRootWorkspacePath] = useState<string>("")
  const [rootWorkspaceName, setRootWorkspaceName] =
    useState<string>("AegisCode")
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(false)

  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const [fileBuffers, setFileBuffers] =
    useState<Record<string, FileBuffer>>(initialFileBuffers)
  const [diagnostics, setDiagnostics] =
    useState<DiagnosticItem[]>(initialDiagnostics)
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications)
  const [recentProjects, setRecentProjects] = useState<string[]>(
    loadStoredRecentProjects,
  )
  const [activeLanguage, setActiveLanguage] = useState("TypeScript")

  const [linterSettings, setLinterSettings] = useState<LinterSettings>({
    enabled: true,
    trigger: "onType",
    showWarnings: true,
  })

  // Concurrency guard instances
  const workspaceGuardRef = useRef(new AsyncSequenceGuard())
  const fileFetchGuardRef = useRef(new AsyncSequenceGuard())

  // Hydrate recent projects from backend flat-file state (~/.aegis/state.json)
  useEffect(() => {
    fetchBackendState()
      .then((backendState) => {
        if (
          backendState &&
          Array.isArray(backendState.recentProjects) &&
          backendState.recentProjects.length > 0
        ) {
          setRecentProjects((prev) => {
            const merged = Array.from(
              new Set([...backendState.recentProjects, ...prev]),
            ).slice(0, 8)
            try {
              window.localStorage.setItem(
                "aegis_recent_projects_v1",
                JSON.stringify(merged),
              )
            } catch {}
            return merged
          })
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch backend recent projects:", err)
      })
  }, [])

  const addRecentProject = useCallback((rawPath: string) => {
    const clean = normalizeWorkspacePath(rawPath)
    if (!clean) return
    setRecentProjects((prev) => {
      const next = [clean, ...prev.filter((p) => p !== clean)].slice(0, 8)
      try {
        window.localStorage.setItem(
          "aegis_recent_projects_v1",
          JSON.stringify(next),
        )
      } catch (err) {
        console.warn("Failed to set recent projects in localStorage:", err)
      }
      return next
    })
    addBackendRecentProject(clean).catch((err) => {
      console.warn("Failed to sync recent project to backend:", err)
    })
  }, [])

  const removeRecentProject = useCallback((path: string) => {
    setRecentProjects((prev) => {
      const next = prev.filter((p) => p !== path)
      try {
        window.localStorage.setItem(
          "aegis_recent_projects_v1",
          JSON.stringify(next),
        )
      } catch (err) {
        console.warn("Failed to set recent projects in localStorage:", err)
      }
      return next
    })
    removeBackendRecentProject(path).catch((err) => {
      console.warn("Failed to remove recent project on backend:", err)
    })
  }, [])

  const clearRecentProjects = useCallback(() => {
    setRecentProjects([])
    try {
      window.localStorage.removeItem("aegis_recent_projects_v1")
    } catch (err) {
      console.warn("Failed to clear recent projects in localStorage:", err)
    }
    clearBackendRecentProjects().catch((err) => {
      console.warn("Failed to clear recent projects on backend:", err)
    })
  }, [])

  const addNotification = useCallback(
    (
      title: string,
      detail: string = "",
      level: "info" | "warning" | "error" | "success" = "info",
    ) => {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = new Date()
      const time = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
      setNotifications((prev) => [
        {
          id,
          title,
          detail,
          time,
          read: false,
          level,
        },
        ...prev.slice(0, 29),
      ])
    },
    [],
  )

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
  }, [])

  // Auto-save any dirty buffers before switching workspace
  const autoSaveDirtyBuffers = useCallback(async () => {
    const dirty = Object.keys(fileBuffers).filter(
      (filename) => fileBuffers[filename]?.isDirty,
    )
    for (const filename of dirty) {
      const buf = fileBuffers[filename]
      if (buf) {
        try {
          await saveWorkspaceFile(filename, buf.content, false)
        } catch {}
      }
    }
  }, [fileBuffers])

  // Thread-safe / Concurrency-safe Workspace Loader
  const loadWorkspace = useCallback(
    async (path?: string, retryCount = 0) => {
      const { requestId } = workspaceGuardRef.current.nextRequest()
      setIsWorkspaceLoading(true)

      try {
        const cleanPath = path ? normalizeWorkspacePath(path) : undefined
        let info
        if (cleanPath) {
          info = await openWorkspace(cleanPath)
        } else {
          const savedPath =
            typeof window !== "undefined"
              ? window.localStorage.getItem("aegis_root_workspace")
              : null
          if (savedPath && savedPath.trim()) {
            info = await openWorkspace(normalizeWorkspacePath(savedPath)).catch(
              () => fetchWorkspaceInfo(),
            )
          } else {
            info = await fetchWorkspaceInfo()
          }
        }

        // If another workspace load was dispatched in the meantime, ignore this one
        if (!workspaceGuardRef.current.isCurrent(requestId)) {
          return
        }

        if (!info || !info.rootPath) {
          // No active workspace (clean / closed state)
          setRootWorkspacePath("")
          setRootWorkspaceName("")
          setFiles([])
          setFileBuffers({})
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("aegis_root_workspace")
          }
          if (onGitStatusUpdated) {
            onGitStatusUpdated({
              isRepo: false,
              branch: "no git",
              repoName: "",
              rootPath: "",
            })
          }
          return
        }

        const normalizedRoot = normalizeWorkspacePath(info.rootPath)
        setRootWorkspacePath(normalizedRoot)
        setRootWorkspaceName(info.name)
        if (typeof window !== "undefined") {
          window.localStorage.setItem("aegis_root_workspace", normalizedRoot)
        }

        const treeData = await fetchWorkspaceTree()
        if (!workspaceGuardRef.current.isCurrent(requestId)) {
          return
        }

        setFiles(treeData.flatTree)

        const gitData = await fetchGitStatus().catch(() => ({
          isRepo: false,
          branch: "",
          repoName: info.name,
        }))

        if (!workspaceGuardRef.current.isCurrent(requestId)) {
          return
        }

        if (onGitStatusUpdated) {
          onGitStatusUpdated({
            isRepo: gitData.isRepo,
            branch: gitData.branch || "main",
            repoName: gitData.repoName || info.name,
            rootPath: normalizedRoot,
          })
        }
      } catch (err: any) {
        if (workspaceGuardRef.current.isCurrent(requestId)) {
          console.warn("Workspace backend not reachable yet or error:", err)
          if (!path && retryCount < 2) {
            setTimeout(() => {
              loadWorkspace(undefined, retryCount + 1)
            }, 800)
          }
        }
      } finally {
        if (workspaceGuardRef.current.isCurrent(requestId)) {
          setIsWorkspaceLoading(false)
        }
      }
    },
    [onGitStatusUpdated],
  )

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const openRootFolder = useCallback(
    async (rawPath: string) => {
      const path = normalizeWorkspacePath(rawPath)
      if (!path) return
      try {
        await autoSaveDirtyBuffers()
        if (onWorkspaceCleared) onWorkspaceCleared()
        setFileBuffers({})
        await loadWorkspace(path)
        addRecentProject(path)
        showToast(`Opened folder: ${path}`)
      } catch (err: any) {
        showToast(`Failed to open folder: ${err.message}`)
      }
    },
    [
      addRecentProject,
      autoSaveDirtyBuffers,
      loadWorkspace,
      onWorkspaceCleared,
      showToast,
    ],
  )

  const closeRootFolder = useCallback(async () => {
    try {
      await autoSaveDirtyBuffers()
      await closeWorkspace()
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("aegis_root_workspace")
      }
      setRootWorkspacePath("")
      setRootWorkspaceName("")
      setFiles([])
      setFileBuffers({})
      if (onWorkspaceCleared) onWorkspaceCleared()
      if (onGitStatusUpdated) {
        onGitStatusUpdated({
          isRepo: false,
          branch: "no git",
          repoName: "",
          rootPath: "",
        })
      }
      showToast("Workspace closed")
    } catch (err: any) {
      showToast(`Failed to close workspace: ${err.message}`)
    }
  }, [autoSaveDirtyBuffers, onGitStatusUpdated, onWorkspaceCleared, showToast])

  const openFolderPicker = useCallback(async () => {
    try {
      const res = await pickFolderNative()
      if (res.status === "ok" && res.path) {
        await openRootFolder(res.path)
      }
    } catch (err: any) {
      console.debug("Folder picker cancelled or dismissed:", err)
    }
  }, [openRootFolder])

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspace()
    showToast("Workspace refreshed")
  }, [loadWorkspace, showToast])

  // Safe file content fetcher with dirty conflict protection
  const fetchBufferSafely = useCallback(
    (filename: string) => {
      const clean = normalizeWorkspacePath(filename, rootWorkspacePath)
      if (!clean) return

      fetchFileDetailed(clean)
        .then((detail) => {
          const content = detail.content
          setFileBuffers((curr) => {
            const existing = curr[clean]
            if (existing?.isDirty) {
              return {
                ...curr,
                [clean]: {
                  ...existing,
                  hasDiskConflict: true,
                },
              }
            }
            return {
              ...curr,
              [clean]: {
                content,
                savedContent: content,
                isDirty: false,
                hasDiskConflict: false,
                isDeletedOnDisk: false,
                language: detectLanguage(clean),
                isLargeFile: detail.isLarge,
                isBinary: detail.isBinary,
                fileSize: detail.size,
              },
            }
          })
          const diags = validateSyntax(clean, content, true)
          setDiagnostics((dPrev) => [
            ...dPrev.filter((d) => !d.location.startsWith(clean)),
            ...diags,
          ])
        })
        .catch((err) => {
          console.warn(`Failed to fetch file content for ${clean}:`, err)
        })
    },
    [rootWorkspacePath],
  )

  const fileBuffersRef = useRef(fileBuffers)
  fileBuffersRef.current = fileBuffers

  // Real-time Workspace SSE Stream (/api/v1/events/workspace)
  useEffect(() => {
    if (!rootWorkspacePath || typeof window === "undefined") return

    let sse: EventSource | null = null
    let reconnectTimer: NodeJS.Timeout | null = null
    let hasConnectedOnce = false

    const connect = () => {
      sse = new EventSource("/api/v1/events/workspace")

      sse.addEventListener("connected", () => {
        if (hasConnectedOnce) {
          // Reconnection reconciliation: refresh tree & git status
          void loadWorkspace()
        }
        hasConnectedOnce = true
      })

      sse.addEventListener("change", (e) => {
        try {
          const evt = JSON.parse(e.data) as WorkspaceChangeEvent
          const { created = [], modified = [], deleted = [] } = evt

          // 1. Refresh Explorer tree if files/folders were created or deleted
          if (created.length > 0 || deleted.length > 0) {
            fetchWorkspaceTree()
              .then((treeData) => setFiles(treeData.flatTree))
              .catch((err) => console.warn("Tree refresh error:", err))
          }

          // 2. Synchronize open buffers
          const activeBuffers = fileBuffersRef.current
          const filesToReload = [...created, ...modified]

          for (const file of filesToReload) {
            const buf = activeBuffers[file]
            if (buf) {
              if (!buf.isDirty) {
                // Buffer is clean: seamless reload from disk
                fetchBufferSafely(file)
              } else {
                // Buffer has unsaved edits: non-destructive conflict flag
                setFileBuffers((prev) => {
                  const current = prev[file]
                  if (!current) return prev
                  return {
                    ...prev,
                    [file]: {
                      ...current,
                      hasDiskConflict: true,
                    },
                  }
                })
                showToast(`File changed on disk: ${file}`)
              }
            }
          }

          if (deleted.length > 0) {
            for (const file of deleted) {
              const buf = activeBuffers[file]
              if (buf) {
                setFileBuffers((prev) => {
                  const current = prev[file]
                  if (!current) return prev
                  return {
                    ...prev,
                    [file]: {
                      ...current,
                      isDeletedOnDisk: true,
                    },
                  }
                })
                showToast(`File deleted on disk: ${file}`)
              }
            }
          }

          // 3. Notify workbench facade for Git status and diff tabs
          if (created.length > 0 || modified.length > 0 || deleted.length > 0) {
            onFilesChangedOnDisk?.(evt)
          }
        } catch (err) {
          console.error("Failed to parse workspace change event:", err)
        }
      })

      sse.onerror = () => {
        sse?.close()
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (sse) sse.close()
    }
  }, [
    rootWorkspacePath,
    fetchBufferSafely,
    loadWorkspace,
    onFilesChangedOnDisk,
    showToast,
  ])

  // Real-time Compiler LSP Diagnostics Stream (/api/v1/events/lsp)
  useEffect(() => {
    const unsub = subscribeLspDiagnostics((evt: any) => {
      if (!evt || !evt.uri || !Array.isArray(evt.diagnostics)) return
      let relPath = evt.uri
      if (relPath.startsWith("file://")) {
        relPath = relPath.slice(7)
      }
      relPath = normalizeWorkspacePath(relPath, rootWorkspacePath)

      const lspDiags: DiagnosticItem[] = evt.diagnostics.map(
        (d: any, idx: number) => ({
          id: `lsp-${relPath}-${d.range?.start?.line ?? 0}-${idx}`,
          title: d.message || "Compiler issue",
          location: `${relPath}:${(d.range?.start?.line ?? 0) + 1}`,
          type: d.severity === 1 ? "error" as const : "warning" as const,
          source: d.source || "lsp",
        }),
      )

      setDiagnostics((prev) => [
        ...prev.filter((item) => !item.location.startsWith(relPath)),
        ...lspDiags,
      ])
    })

    return unsub
  }, [rootWorkspacePath])

  const ensureFileBuffer = useCallback(
    (filename: string) => {
      const clean = normalizeWorkspacePath(filename, rootWorkspacePath)
      if (!clean) return
      setFileBuffers((prev) => {
        if (!prev[clean]) {
          fetchBufferSafely(clean)
          return {
            ...prev,
            [clean]: {
              content: "",
              savedContent: "",
              isDirty: false,
              language: detectLanguage(clean),
            },
          }
        }
        return prev
      })
    },
    [fetchBufferSafely, rootWorkspacePath],
  )

  const updateFileContent = useCallback(
    (filename: string, content: string) => {
      setFileBuffers((prev) =>
        updateBufferContentLogic(prev, filename, content),
      )

      if (
        linterSettings.enabled &&
        linterSettings.trigger === "onType" &&
        !isLspLanguage(filename)
      ) {
        const diags = validateSyntax(
          filename,
          content,
          linterSettings.showWarnings,
        )
        setDiagnostics((prev) => [
          ...prev.filter((d) => !d.location.startsWith(filename)),
          ...diags,
        ])
      }
    },
    [linterSettings],
  )

  const saveFile = useCallback(
    async (filenameToSave?: string, options?: FileHygieneOptions) => {
      if (!filenameToSave) return

      const buf = fileBuffers[filenameToSave]
      if (buf?.isLargeFile || buf?.isBinary) {
        showToast("Cannot overwrite file: opened in read-only preview mode.")
        return
      }
      let contentToSave = buf?.content ?? ""
      if (buf && options) {
        contentToSave = sanitizeContentOnSave(contentToSave, options)
      }

      if (buf) {
        try {
          await saveWorkspaceFile(filenameToSave, contentToSave, false)
        } catch (err: any) {
          console.error("Failed to save to backend:", err)
          showToast(`Save failed: ${err.message || "Failed to write file"}`)
          return
        }
      }

      setFileBuffers((prev) => {
        const marked = markBufferSavedLogic(prev, filenameToSave)
        if (
          options &&
          marked[filenameToSave] &&
          contentToSave !== prev[filenameToSave]?.content
        ) {
          return {
            ...marked,
            [filenameToSave]: {
              ...marked[filenameToSave],
              content: contentToSave,
              savedContent: contentToSave,
              isDirty: false,
            },
          }
        }
        return marked
      })

      if (linterSettings.enabled && buf && !isLspLanguage(filenameToSave)) {
        const fileDiags = validateSyntax(
          filenameToSave,
          contentToSave,
          linterSettings.showWarnings,
        )
        setDiagnostics((prev) => [
          ...prev.filter((d) => !d.location.startsWith(filenameToSave)),
          ...fileDiags,
        ])
      }

      showToast(`Saved ${filenameToSave}`)
    },
    [fileBuffers, linterSettings, showToast],
  )

  const revertBufferContent = useCallback(
    (filename: string) => {
      setFileBuffers((prev) => revertBufferContentLogic(prev, filename))
      const buf = fileBuffers[filename]
      const reverted = buf?.savedContent ?? buf?.content ?? ""
      if (linterSettings.enabled && !isLspLanguage(filename)) {
        const diags = validateSyntax(
          filename,
          reverted,
          linterSettings.showWarnings,
        )
        setDiagnostics((prev) => [
          ...prev.filter((d) => !d.location.startsWith(filename)),
          ...diags,
        ])
      }
      showToast(`Reverted changes to ${filename}`)
    },
    [fileBuffers, linterSettings, showToast],
  )

  const moveFile = useCallback(
    async (sourcePath: string, targetDirectory: string) => {
      try {
        const newPath = await moveWorkspaceFile(sourcePath, targetDirectory)
        showToast(`Moved to ${newPath}`)
        await loadWorkspace()
        if (onFileRenamed) {
          onFileRenamed(sourcePath, newPath)
        }
      } catch (err: any) {
        showToast(`Move failed: ${err.message}`)
      }
    },
    [loadWorkspace, onFileRenamed, showToast],
  )

  const syncBufferWithDisk = useCallback(
    (filename: string, content: string) => {
      setFileBuffers((prev) => syncBufferWithDiskLogic(prev, filename, content))
    },
    [],
  )

  const createFile = useCallback(
    async (name: string, isFolder = false, parentFolder?: string) => {
      const cleanName = name.trim()
      if (!cleanName) return

      const newPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName
      try {
        await saveWorkspaceFile(
          newPath,
          isFolder ? "" : `// ${cleanName}\n`,
          isFolder,
          true,
        )
        await loadWorkspace()
        setFiles((prev) => addFileToTreeLogic(prev, newPath, isFolder))
        showToast(`Created ${isFolder ? "folder" : "file"}: ${cleanName}`)
        return newPath
      } catch (err: any) {
        showToast(`Create failed: ${err.message}`)
      }
    },
    [loadWorkspace, showToast],
  )

  const renameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const clean = newName.trim()
      if (!clean || clean === oldPath) return

      const normalizedOld = oldPath.replace(/\\/g, "/")
      const parentDir = normalizedOld.includes("/")
        ? normalizedOld.substring(0, normalizedOld.lastIndexOf("/"))
        : ""
      const newPath = parentDir ? `${parentDir}/${clean}` : clean

      try {
        await renameWorkspaceFile(oldPath, newPath)
        await loadWorkspace()
        setFiles((prev) => renameFileInTreeLogic(prev, oldPath, newPath))
        if (onFileRenamed) {
          onFileRenamed(oldPath, newPath)
        }
        showToast(`Renamed to ${clean}`)
      } catch (err: any) {
        showToast(`Rename failed: ${err.message}`)
      }
    },
    [loadWorkspace, onFileRenamed, showToast],
  )

  const deleteFile = useCallback(
    async (name: string) => {
      try {
        await deleteWorkspaceFile(name)
        if (onFileDeleted) {
          onFileDeleted(name)
        }
        setFileBuffers((prev) => {
          const next = { ...prev }
          delete next[name]
          return next
        })
        setFiles((prev) => removeFileFromTreeLogic(prev, name))
        await loadWorkspace()
        showToast(`Deleted ${name}`)
      } catch (err: any) {
        showToast(`Delete failed: ${err.message}`)
      }
    },
    [loadWorkspace, onFileDeleted, showToast],
  )

  const navigateToDiagnostic = useCallback(
    (diag: DiagnosticItem) => {
      const match = diag.location.match(/^([^[\s]+)\s*\[(\d+),\s*(\d+)\]/)
      if (match) {
        const filename = match[1]
        const line = parseInt(match[2], 10)
        const col = parseInt(match[3], 10)

        if (openFileInPane) {
          openFileInPane(filename)
        }
        if (setCursorPosition) {
          setCursorPosition({ line, col })
        }
        showToast(`Jumped to ${filename} [Ln ${line}, Col ${col}]`)
      } else {
        showToast(`Navigating to ${diag.location}`)
      }
    },
    [openFileInPane, setCursorPosition, showToast],
  )

  return {
    rootWorkspacePath,
    rootWorkspaceName,
    isWorkspaceLoading,
    recentProjects,
    addRecentProject,
    removeRecentProject,
    clearRecentProjects,
    openFolderPicker,
    openRootFolder,
    closeRootFolder,
    refreshWorkspace,
    moveFile,
    files,
    setFiles,
    createFile,
    renameFile,
    deleteFile,
    fileBuffers,
    setFileBuffers,
    updateFileContent,
    syncBufferWithDisk,
    saveFile,
    revertBufferContent,
    ensureFileBuffer,
    fetchBufferSafely,
    diagnostics,
    setDiagnostics,
    notifications,
    addNotification,
    clearAllNotifications,
    removeNotification,
    markAllNotificationsRead,
    markNotificationRead,
    activeLanguage,
    setActiveLanguage,
    linterSettings,
    setLinterSettings,
    navigateToDiagnostic,
    autoSaveDirtyBuffers,
  }
}

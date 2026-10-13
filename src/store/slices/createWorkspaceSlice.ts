import type {
  DiagnosticItem,
  FileBuffer,
  FileItem,
  LinterSettings,
  NotificationItem,
} from "../../types/workbench"
import {
  initialDiagnostics,
  initialFileBuffers,
  initialFiles,
  initialNotifications,
} from "../../data/mockData"
import { detectLanguage, isLspLanguage } from "../../utils/linter"
import { offloadService } from "../../utils/offloadService"

let linterDebounceTimer: ReturnType<typeof setTimeout> | null = null
let linterAbortController: AbortController | null = null

interface OffloadLintPayload {
  filename: string
  content: string
}

function triggerOffloadedLint(
  filename: string,
  content: string,
  showWarnings: boolean,
  set: any,
  debounceMs = 0,
) {
  if (debounceMs > 0) {
    if (linterDebounceTimer) clearTimeout(linterDebounceTimer)
    if (linterAbortController) linterAbortController.abort()

    linterAbortController = new AbortController()
    const signal = linterAbortController.signal

    linterDebounceTimer = setTimeout(() => {
      offloadService
        .run<OffloadLintPayload, DiagnosticItem[]>({
          task: "lint",
          payload: { filename, content },
          priority: "normal",
          signal,
        })
        .then((res) => {
          if (!res?.data) return
          const diags = showWarnings
            ? res.data
            : res.data.filter((d) => d.type === "error")
          set((state: any) => ({
            diagnostics: [
              ...state.diagnostics.filter(
                (d: DiagnosticItem) => !d.location.startsWith(filename),
              ),
              ...diags,
            ],
          }))
        })
        .catch(() => {
          // Aborted or safe ignore
        })
    }, debounceMs)
  } else {
    offloadService
      .run<OffloadLintPayload, DiagnosticItem[]>({
        task: "lint",
        payload: { filename, content },
        priority: "normal",
      })
      .then((res) => {
        if (!res?.data) return
        const diags = showWarnings
          ? res.data
          : res.data.filter((d) => d.type === "error")
        set((state: any) => ({
          diagnostics: [
            ...state.diagnostics.filter(
              (d: DiagnosticItem) => !d.location.startsWith(filename),
            ),
            ...diags,
          ],
        }))
      })
      .catch(() => {
        // Safe ignore
      })
  }
}
import {
  closeWorkspace,
  deleteWorkspaceFile,
  fetchFileDetailed,
  fetchWorkspaceInfo,
  fetchWorkspaceTree,
  moveWorkspaceFile,
  openWorkspace,
  pickFolderNative,
  renameWorkspaceFile,
  saveWorkspaceFile,
  normalizeWorkspacePath,
  sortFileTree,
} from "../../utils/workspaceApi"
import {
  addBackendRecentProject,
  clearBackendRecentProjects,
  removeBackendRecentProject,
} from "../../utils/storeApi"
import type { SliceCreator, WorkspaceSlice } from "../types"

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
    open: false,
  }

  return sortFileTree([...files, newItem])
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
  const updated = files.map((f) => {
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
  return sortFileTree(updated)
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
  } catch (err) {
    console.warn("Failed to read recent projects from localStorage:", err)
  }
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

const workspaceGuard = new AsyncSequenceGuard()

export async function loadWorkspaceInternal(
  get: () => any,
  set: (patch: any) => void,
  path?: string,
  retryCount = 0,
): Promise<void> {
  const { requestId } = workspaceGuard.nextRequest()
  set({ isWorkspaceLoading: true })

  try {
    const cleanPath = path ? normalizeWorkspacePath(path) : undefined
    let info
    if (cleanPath) {
      info = await openWorkspace(cleanPath)
    } else {
      const savedPath =
        typeof window !== "undefined"
          ? window.localStorage?.getItem("aegis_root_workspace")
          : null
      if (savedPath && savedPath.trim()) {
        try {
          info = await openWorkspace(normalizeWorkspacePath(savedPath))
        } catch (err) {
          console.warn(
            "Failed to open saved workspace, falling back to workspace info:",
            err,
          )
          info = await fetchWorkspaceInfo()
        }
      } else {
        info = await fetchWorkspaceInfo()
      }
    }

    if (!workspaceGuard.isCurrent(requestId)) {
      return
    }

    if (!info || !info.rootPath) {
      set({
        rootWorkspacePath: "",
        rootWorkspaceName: "",
        files: [],
        fileBuffers: {},
      })
      try {
        window.localStorage?.removeItem("aegis_root_workspace")
      } catch (err) {
        console.warn("Failed to remove root workspace from localStorage:", err)
      }
      return
    }

    const normalizedRoot = normalizeWorkspacePath(info.rootPath)
    try {
      window.localStorage?.setItem("aegis_root_workspace", normalizedRoot)
    } catch (err) {
      console.warn("Failed to save root workspace to localStorage:", err)
    }

    const treeData = await fetchWorkspaceTree()
    if (!workspaceGuard.isCurrent(requestId)) {
      return
    }

    set({
      rootWorkspacePath: normalizedRoot,
      rootWorkspaceName: info.name,
      files: treeData.flatTree,
    })

    if (typeof get().refreshGit === "function") {
      void get().refreshGit()
    }
  } catch (err: any) {
    if (workspaceGuard.isCurrent(requestId)) {
      console.warn("Workspace backend not reachable yet or error:", err)
      if (!path && retryCount < 2) {
        setTimeout(() => {
          void loadWorkspaceInternal(get, set, undefined, retryCount + 1)
        }, 800)
      }
    }
  } finally {
    if (workspaceGuard.isCurrent(requestId)) {
      set({ isWorkspaceLoading: false })
    }
  }
}

export const createWorkspaceSlice: SliceCreator<WorkspaceSlice> = (
  set,
  get,
) => ({
  rootWorkspacePath: "",
  rootWorkspaceName: "AegisCode",
  isWorkspaceLoading: false,
  recentProjects: loadStoredRecentProjects(),

  addRecentProject: async (rawPath: string) => {
    const clean = normalizeWorkspacePath(rawPath)
    if (!clean) return
    const prev = get().recentProjects
    const next = [clean, ...prev.filter((p) => p !== clean)].slice(0, 8)
    try {
      window.localStorage?.setItem(
        "aegis_recent_projects_v1",
        JSON.stringify(next),
      )
    } catch (err) {
      console.warn("Failed to save recent projects to localStorage:", err)
    }
    set({ recentProjects: next })
    try {
      await addBackendRecentProject(clean)
    } catch (err) {
      console.warn("Failed to persist recent project to backend:", err)
    }
  },

  removeRecentProject: async (path: string) => {
    const prev = get().recentProjects
    const next = prev.filter((p) => p !== path)
    try {
      window.localStorage?.setItem(
        "aegis_recent_projects_v1",
        JSON.stringify(next),
      )
    } catch (err) {
      console.warn("Failed to save recent projects to localStorage:", err)
    }
    set({ recentProjects: next })
    try {
      await removeBackendRecentProject(path)
    } catch (err) {
      console.warn("Failed to remove recent project from backend:", err)
    }
  },

  clearRecentProjects: async () => {
    try {
      window.localStorage?.removeItem("aegis_recent_projects_v1")
    } catch (err) {
      console.warn("Failed to clear recent projects in localStorage:", err)
    }
    set({ recentProjects: [] })
    try {
      await clearBackendRecentProjects()
    } catch (err) {
      console.warn("Failed to clear recent projects on backend:", err)
    }
  },

  openFolderPicker: async () => {
    try {
      const res = await pickFolderNative()
      if (res.status === "ok" && res.path) {
        await get().openRootFolder(res.path)
      }
    } catch (err: any) {
      console.debug("Folder picker cancelled or dismissed:", err)
    }
  },

  openRootFolder: async (rawPath: string) => {
    const path = normalizeWorkspacePath(rawPath)
    if (!path) return
    try {
      await get().autoSaveDirtyBuffers()
      if (typeof get().resetAllGroups === "function") {
        get().resetAllGroups()
      }
      set({ fileBuffers: {} })
      await loadWorkspaceInternal(get, set, path)
      await get().addRecentProject(path)
      get().showToast?.(`Opened folder: ${path}`)
    } catch (err: any) {
      get().showToast?.(`Failed to open folder: ${err.message || String(err)}`)
    }
  },

  closeRootFolder: async () => {
    try {
      await get().autoSaveDirtyBuffers()
      await closeWorkspace()
      try {
        window.localStorage?.removeItem("aegis_root_workspace")
      } catch (err) {
        console.warn("Failed to remove root workspace from localStorage:", err)
      }
      set({
        rootWorkspacePath: "",
        rootWorkspaceName: "",
        files: [],
        fileBuffers: {},
      })
      if (typeof get().resetAllGroups === "function") {
        get().resetAllGroups()
      }
      if (typeof get().refreshGit === "function") {
        void get().refreshGit()
      }
      get().showToast?.("Workspace closed")
    } catch (err: any) {
      get().showToast?.(
        `Failed to close workspace: ${err.message || String(err)}`,
      )
    }
  },

  safeOpenRootFolder: async (folderPath: string) => {
    await get().openRootFolder(folderPath)
  },

  safeCloseRootFolder: async () => {
    await get().closeRootFolder()
  },

  refreshWorkspace: async () => {
    await loadWorkspaceInternal(get, set, get().rootWorkspacePath || undefined)
    get().showToast?.("Workspace refreshed")
  },

  moveFile: async (sourcePath: string, targetDirectory: string) => {
    try {
      const newPath = await moveWorkspaceFile(sourcePath, targetDirectory)
      get().showToast?.(`Moved to ${newPath}`)
      await loadWorkspaceInternal(
        get,
        set,
        get().rootWorkspacePath || undefined,
      )
      if (typeof get().renameTabsInBothGroups === "function") {
        get().renameTabsInBothGroups(sourcePath, newPath)
      }
    } catch (err: any) {
      get().showToast?.(`Move failed: ${err.message || String(err)}`)
    }
  },

  files: initialFiles,
  setFiles: (updater) =>
    set((state) => ({
      files: typeof updater === "function" ? updater(state.files) : updater,
    })),

  createFile: async (name: string, isFolder = false, parentFolder?: string) => {
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
      await loadWorkspaceInternal(
        get,
        set,
        get().rootWorkspacePath || undefined,
      )
      set((state) => ({
        files: addFileToTreeLogic(state.files, newPath, isFolder),
      }))
      get().showToast?.(`Created ${isFolder ? "folder" : "file"}: ${cleanName}`)
      return newPath
    } catch (err: any) {
      get().showToast?.(`Create failed: ${err.message || String(err)}`)
    }
  },

  renameFile: async (oldPath: string, newName: string) => {
    const clean = newName.trim()
    if (!clean || clean === oldPath) return

    const normalizedOld = oldPath.replace(/\\/g, "/")
    const parentDir = normalizedOld.includes("/")
      ? normalizedOld.substring(0, normalizedOld.lastIndexOf("/"))
      : ""
    const newPath = parentDir ? `${parentDir}/${clean}` : clean

    try {
      await renameWorkspaceFile(oldPath, newPath)
      await loadWorkspaceInternal(
        get,
        set,
        get().rootWorkspacePath || undefined,
      )
      set((state) => ({
        files: renameFileInTreeLogic(state.files, oldPath, newPath),
      }))
      if (typeof get().renameTabsInBothGroups === "function") {
        get().renameTabsInBothGroups(oldPath, newPath)
      }
      get().showToast?.(`Renamed to ${clean}`)
    } catch (err: any) {
      get().showToast?.(`Rename failed: ${err.message || String(err)}`)
    }
  },

  deleteFile: async (name: string) => {
    try {
      await deleteWorkspaceFile(name)
      if (typeof get().closeTabInBothGroups === "function") {
        get().closeTabInBothGroups(name)
      }
      set((state) => {
        const nextBuffers = { ...state.fileBuffers }
        delete nextBuffers[name]
        return {
          fileBuffers: nextBuffers,
          files: removeFileFromTreeLogic(state.files, name),
        }
      })
      await loadWorkspaceInternal(
        get,
        set,
        get().rootWorkspacePath || undefined,
      )
      get().showToast?.(`Deleted ${name}`)
    } catch (err: any) {
      get().showToast?.(`Delete failed: ${err.message || String(err)}`)
    }
  },

  fileBuffers: initialFileBuffers,
  setFileBuffers: (updater) =>
    set((state) => ({
      fileBuffers:
        typeof updater === "function" ? updater(state.fileBuffers) : updater,
    })),

  updateFileContent: (filename: string, content: string) => {
    set((state) => ({
      fileBuffers: updateBufferContentLogic(
        state.fileBuffers,
        filename,
        content,
      ),
    }))

    const linterSettings = get().linterSettings
    if (
      linterSettings.enabled &&
      linterSettings.trigger === "onType" &&
      !isLspLanguage(filename)
    ) {
      triggerOffloadedLint(
        filename,
        content,
        linterSettings.showWarnings,
        set,
        300,
      )
    }
  },

  syncBufferWithDisk: (filename: string, content: string) => {
    set((state) => ({
      fileBuffers: syncBufferWithDiskLogic(
        state.fileBuffers,
        filename,
        content,
      ),
    }))
  },

  saveFile: async (
    filenameToSave?: string,
    options?: FileHygieneOptions,
  ): Promise<void> => {
    if (!filenameToSave) return

    const buf = get().fileBuffers[filenameToSave]
    if (buf?.isLargeFile || buf?.isBinary) {
      get().showToast?.(
        "Cannot overwrite file: opened in read-only preview mode.",
      )
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
        get().showToast?.(
          `Save failed: ${err.message || "Failed to write file"}`,
        )
        return
      }
    }

    set((state) => {
      const marked = markBufferSavedLogic(state.fileBuffers, filenameToSave)
      if (
        options &&
        marked[filenameToSave] &&
        contentToSave !== state.fileBuffers[filenameToSave]?.content
      ) {
        return {
          fileBuffers: {
            ...marked,
            [filenameToSave]: {
              ...marked[filenameToSave],
              content: contentToSave,
              savedContent: contentToSave,
              isDirty: false,
            },
          },
        }
      }
      return { fileBuffers: marked }
    })

    const linterSettings = get().linterSettings
    if (linterSettings.enabled && buf && !isLspLanguage(filenameToSave)) {
      triggerOffloadedLint(
        filenameToSave,
        contentToSave,
        linterSettings.showWarnings,
        set,
        0,
      )
    }

    // Cross-slice Git refresh
    if (typeof get().refreshGit === "function") {
      void get().refreshGit()
    }

    get().showToast?.(`Saved ${filenameToSave}`)
  },

  applyCodeWithReview: async (
    targetPath: string,
    code: string,
  ): Promise<boolean> => {
    const cleanPath = targetPath.trim()
    if (!cleanPath) {
      get().showToast?.("Cannot apply: target file path is empty")
      return false
    }

    const existingBuf = get().fileBuffers[cleanPath]
    if (existingBuf?.isDirty) {
      const confirmOverwrite =
        typeof window !== "undefined" && window.confirm
          ? window.confirm(
              `File "${cleanPath}" has unsaved changes. Overwrite with AI code and review in Git diff?`,
            )
          : true
      if (!confirmOverwrite) {
        get().showToast?.("Apply cancelled")
        return false
      }
    }

    try {
      await saveWorkspaceFile(cleanPath, code, false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().showToast?.(`Apply failed: ${msg}`)
      return false
    }

    set((state) => ({
      fileBuffers: {
        ...state.fileBuffers,
        [cleanPath]: {
          content: code,
          savedContent: code,
          isDirty: false,
          hasDiskConflict: false,
          language: detectLanguage(cleanPath),
          lastSaved: Date.now(),
        },
      },
    }))

    if (typeof get().refreshGit === "function") {
      await get().refreshGit()
    }
    set((state) => ({
      gitDiffVersion: ((state as any).gitDiffVersion ?? 0) + 1,
    }))

    if (typeof get().openGitDiff === "function") {
      get().openGitDiff(cleanPath)
    }

    get().showToast?.(`Applied code to ${cleanPath} — opened Git review`)
    return true
  },

  revertBufferContent: (filename: string) => {
    set((state) => ({
      fileBuffers: revertBufferContentLogic(state.fileBuffers, filename),
    }))
    const buf = get().fileBuffers[filename]
    const reverted = buf?.savedContent ?? buf?.content ?? ""
    const linterSettings = get().linterSettings
    if (linterSettings.enabled && !isLspLanguage(filename)) {
      triggerOffloadedLint(
        filename,
        reverted,
        linterSettings.showWarnings,
        set,
        0,
      )
    }
    get().showToast?.(`Reverted changes to ${filename}`)
  },

  ensureFileBuffer: (filename: string) => {
    const clean = normalizeWorkspacePath(filename, get().rootWorkspacePath)
    if (!clean) return
    const current = get().fileBuffers[clean]
    if (!current) {
      set((state) => ({
        fileBuffers: {
          ...state.fileBuffers,
          [clean]: {
            content: "",
            savedContent: "",
            isDirty: false,
            language: detectLanguage(clean),
          },
        },
      }))
      return get().fetchBufferSafely(clean)
    }
  },

  fetchBufferSafely: async (filename: string): Promise<void> => {
    const clean = normalizeWorkspacePath(filename, get().rootWorkspacePath)
    if (!clean) return

    try {
      const detail = await fetchFileDetailed(clean)
      const content = detail.content
      set((state) => {
        const existing = state.fileBuffers[clean]
        if (existing?.isDirty) {
          return {
            fileBuffers: {
              ...state.fileBuffers,
              [clean]: {
                ...existing,
                hasDiskConflict: true,
              },
            },
          }
        }
        return {
          fileBuffers: {
            ...state.fileBuffers,
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
          },
        }
      })
      triggerOffloadedLint(clean, content, true, set, 0)
    } catch (err) {
      console.warn(`Failed to fetch file content for ${clean}:`, err)
    }
  },

  diagnostics: initialDiagnostics,
  setDiagnostics: (updater) =>
    set((state) => ({
      diagnostics:
        typeof updater === "function" ? updater(state.diagnostics) : updater,
    })),

  notifications: initialNotifications,
  addNotification: (
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
    set((state) => ({
      notifications: [
        {
          id,
          title,
          detail,
          time,
          read: false,
          level,
        },
        ...state.notifications.slice(0, 29),
      ],
    }))
  },

  clearAllNotifications: () => set({ notifications: [] }),

  removeNotification: (id: string) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({
        ...item,
        read: true,
      })),
    })),

  markNotificationRead: (id: string) =>
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    })),

  activeLanguage: "TypeScript",
  setActiveLanguage: (lang: string) => set({ activeLanguage: lang }),

  linterSettings: {
    enabled: true,
    trigger: "onType",
    showWarnings: true,
  },
  setLinterSettings: (updater) =>
    set((state) => ({
      linterSettings:
        typeof updater === "function" ? updater(state.linterSettings) : updater,
    })),

  navigateToDiagnostic: (diag: DiagnosticItem) => {
    const match = diag.location.match(/^([^[\s]+)\s*\[(\d+),\s*(\d+)\]/)
    if (match) {
      const filename = match[1]
      const line = parseInt(match[2], 10)
      const col = parseInt(match[3], 10)

      if (typeof get().openFileInPane === "function") {
        get().openFileInPane(filename)
      }
      if (typeof get().setCursorPosition === "function") {
        get().setCursorPosition({ line, col })
      }
      get().showToast?.(`Jumped to ${filename} [Ln ${line}, Col ${col}]`)
    } else {
      get().showToast?.(`Navigating to ${diag.location}`)
    }
  },

  autoSaveDirtyBuffers: async () => {
    const fileBuffers = get().fileBuffers
    const dirty = Object.keys(fileBuffers).filter(
      (filename) => fileBuffers[filename]?.isDirty,
    )
    for (const filename of dirty) {
      const buf = fileBuffers[filename]
      if (buf) {
        try {
          await saveWorkspaceFile(filename, buf.content, false)
        } catch (err) {
          console.warn(`Failed to auto-save dirty buffer for ${filename}:`, err)
        }
      }
    }
  },
})

import type {
  DiagnosticItem,
  FileBuffer,
  FileItem,
  GotoLineEventDetail,
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
import { notifyLspDidSave } from "../../utils/lspApi"
import { offloadService } from "../../utils/offloadService"
import {
  isGraphTab,
  isSettingsTab,
} from "../../components/layout/editor/viewers/viewerTypes"
import { isGitDiffTab } from "../../utils/gitDiffTab"

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
  contentToSave?: string,
): Record<string, FileBuffer> {
  const currentBuf = buffers[filename]
  if (!currentBuf) return buffers

  const savedContent =
    contentToSave !== undefined ? contentToSave : currentBuf.content
  const isDirty = currentBuf.content !== savedContent

  return {
    ...buffers,
    [filename]: {
      ...currentBuf,
      savedContent,
      isDirty,
      lastSaved: Date.now(),
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
const fileFetchTokens: Record<string, number> = {}

export async function loadWorkspaceInternal(
  get: () => any,
  set: (patch: any) => void,
  path?: string,
  retryCount = 0,
): Promise<void> {
  const targetEpoch = get().workspaceEpoch
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

    if (
      get().workspaceEpoch !== targetEpoch ||
      !workspaceGuard.isCurrent(requestId)
    ) {
      return
    }

    if (!info || !info.rootPath) {
      set({
        rootWorkspacePath: "",
        rootWorkspaceName: "",
        files: [],
        fileBuffers: {},
      })
      if (typeof get().closeAllTabs === "function") {
        get().closeAllTabs()
      }
      try {
        window.localStorage?.removeItem("aegis_root_workspace")
      } catch (err) {
        console.warn("Failed to remove root workspace from localStorage:", err)
      }
      return
    }

    const prevRoot = get().rootWorkspacePath
    const normalizedRoot = normalizeWorkspacePath(info.rootPath)
    if (prevRoot && prevRoot !== normalizedRoot) {
      set({ fileBuffers: {} })
    }
    try {
      window.localStorage?.setItem("aegis_root_workspace", normalizedRoot)
    } catch (err) {
      console.warn("Failed to save root workspace to localStorage:", err)
    }

    const treeData = await fetchWorkspaceTree()
    if (
      get().workspaceEpoch !== targetEpoch ||
      !workspaceGuard.isCurrent(requestId)
    ) {
      return
    }

    // Map each file to its canonical workspace-relative path
    const canonicalMap = new Map<string, string>()
    for (const f of treeData.flatTree) {
      if (f.type !== "folder" && f.path) {
        canonicalMap.set(f.path, f.path)
        const base = f.path.split("/").pop()
        if (base && !canonicalMap.has(base)) {
          canonicalMap.set(base, f.path)
        }
      }
    }

    const resolveTabCanonical = (t: string): string | null => {
      if (!t) return null
      if (canonicalMap.has(t)) return canonicalMap.get(t)!
      const base = t.split("/").pop()
      if (base && canonicalMap.has(base)) return canonicalMap.get(base)!
      return null
    }

    // Clean up tabs in editor groups that do not belong to the newly loaded workspace
    const g1 = get().group1
    const g2 = get().group2
    const validG1Tabs: string[] = []
    for (const t of g1?.tabs || []) {
      const canonical = resolveTabCanonical(t)
      if (canonical && !validG1Tabs.includes(canonical)) {
        validG1Tabs.push(canonical)
      }
    }
    const validG2Tabs: string[] = []
    for (const t of g2?.tabs || []) {
      const canonical = resolveTabCanonical(t)
      if (canonical && !validG2Tabs.includes(canonical)) {
        validG2Tabs.push(canonical)
      }
    }

    // Fallback: If no valid tabs survived, pick primary file so workspace is not empty
    if (validG1Tabs.length === 0 && treeData.flatTree.length > 0) {
      const preferred = [
        "App.tsx",
        "main.tsx",
        "index.tsx",
        "index.ts",
        "main.go",
        "main.py",
        "index.js",
        "README.md",
      ]
      let defaultTab = ""
      for (const pref of preferred) {
        if (canonicalMap.has(pref)) {
          defaultTab = canonicalMap.get(pref)!
          break
        }
      }
      if (!defaultTab) {
        const firstFile = treeData.flatTree.find(
          (f) => f.type !== "folder" && f.path,
        )
        if (firstFile?.path) {
          defaultTab = firstFile.path
        }
      }
      if (defaultTab) {
        validG1Tabs.push(defaultTab)
      }
    }

    const activeG1 =
      resolveTabCanonical(g1?.activeTab || "") || validG1Tabs[0] || ""
    const activeG2 =
      resolveTabCanonical(g2?.activeTab || "") || validG2Tabs[0] || ""
    const allTabs = Array.from(new Set([...validG1Tabs, ...validG2Tabs]))
    const priorityTabs = [activeG1, activeG2].filter(Boolean)

    if (get().workspaceEpoch !== targetEpoch) return

    // Register background tabs as idle without firing HTTP request
    const idleBuffers: Record<string, FileBuffer> = {}
    for (const tab of allTabs) {
      if (!priorityTabs.includes(tab) && !get().fileBuffers[tab]) {
        idleBuffers[tab] = {
          content: "",
          savedContent: "",
          isDirty: false,
          hasDiskConflict: false,
          isDeletedOnDisk: false,
          language: detectLanguage(tab),
          status: "idle",
        }
      }
    }

    set((state: any) => ({
      rootWorkspacePath: normalizedRoot,
      rootWorkspaceName: info.name,
      files: treeData.flatTree,
      group1: { ...g1, tabs: validG1Tabs, activeTab: activeG1 },
      group2: { ...g2, tabs: validG2Tabs, activeTab: activeG2 },
      tabs: allTabs,
      activeTab: activeG1,
      currentFocusedFile: activeG1 || null,
      fileBuffers: {
        ...state.fileBuffers,
        ...idleBuffers,
      },
    }))

    // Immediately pre-fetch and await active tabs to ensure immediate buffer availability
    if (priorityTabs.length > 0) {
      await Promise.allSettled(
        priorityTabs.map((tab) => get().fetchBufferSafely(tab)),
      )
    }

    if (get().workspaceEpoch !== targetEpoch) return

    if (typeof get().refreshGit === "function") {
      void get().refreshGit()
    }
    if (typeof (get() as any).refreshAISkills === "function") {
      void (get() as any).refreshAISkills(undefined, normalizedRoot)
    }
  } catch (err: any) {
    if (
      get().workspaceEpoch === targetEpoch &&
      workspaceGuard.isCurrent(requestId)
    ) {
      console.warn("Workspace backend not reachable yet or error:", err)
      if (!path && retryCount < 2) {
        setTimeout(() => {
          if (get().workspaceEpoch === targetEpoch) {
            void loadWorkspaceInternal(get, set, undefined, retryCount + 1)
          }
        }, 800)
      }
    }
  } finally {
    if (
      get().workspaceEpoch === targetEpoch &&
      workspaceGuard.isCurrent(requestId)
    ) {
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
  workspaceEpoch: 0,
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

  folderBrowserModalOpen: false,
  openFolderBrowserModal: () => set({ folderBrowserModalOpen: true }),
  closeFolderBrowserModal: () => set({ folderBrowserModalOpen: false }),

  openFolderPicker: async () => {
    try {
      const res = await pickFolderNative()
      if (res.status === "ok" && res.path) {
        await get().openRootFolder(res.path)
        return
      }
      if (res.status === "cancelled") {
        return
      }
    } catch (err: unknown) {
      console.debug("Native folder picker unavailable or error:", err)
    }

    // Host/web browser fallback: open the interactive file manager modal
    set({ folderBrowserModalOpen: true })
  },

  openRootFolder: async (rawPath: string) => {
    const path = normalizeWorkspacePath(rawPath)
    if (!path) return
    set({ workspaceEpoch: get().workspaceEpoch + 1 })
    try {
      await get().autoSaveDirtyBuffers()
      await loadWorkspaceInternal(get, set, path)
      await get().addRecentProject(path)
      const terminalRestart = (get() as {
        restartTerminalSession?: () => Promise<void>
      }).restartTerminalSession
      if (typeof terminalRestart === "function") {
        void terminalRestart()
      }
      if (typeof (get() as any).resetView === "function") {
        ;(get() as any).resetView()
      }
      get().showToast?.(`Opened folder: ${path}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().showToast?.(`Failed to open folder: ${msg}`)
    }
  },

  closeRootFolder: async () => {
    set({ workspaceEpoch: get().workspaceEpoch + 1 })
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
      if (typeof (get() as any).resetView === "function") {
        ;(get() as any).resetView()
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
        const rootPath = get().rootWorkspacePath
        const clean = rootPath ? normalizeWorkspacePath(name, rootPath) : name
        if (clean) delete nextBuffers[clean]
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
    const rootPath = get().rootWorkspacePath
    const clean = rootPath
      ? normalizeWorkspacePath(filename, rootPath)
      : filename
    const targetKey = get().fileBuffers[clean]
      ? clean
      : get().fileBuffers[filename]
        ? filename
        : clean
    set((state) => ({
      fileBuffers: updateBufferContentLogic(
        state.fileBuffers,
        targetKey,
        content,
      ),
    }))

    const linterSettings = get().linterSettings
    if (
      linterSettings.enabled &&
      linterSettings.trigger === "onType" &&
      !isLspLanguage(clean)
    ) {
      triggerOffloadedLint(
        clean,
        content,
        linterSettings.showWarnings,
        set,
        300,
      )
    }
  },

  syncBufferWithDisk: (filename: string, content: string) => {
    const rootPath = get().rootWorkspacePath
    const clean = rootPath
      ? normalizeWorkspacePath(filename, rootPath)
      : filename
    const targetKey = get().fileBuffers[clean]
      ? clean
      : get().fileBuffers[filename]
        ? filename
        : clean
    set((state) => ({
      fileBuffers: syncBufferWithDiskLogic(
        state.fileBuffers,
        targetKey,
        content,
      ),
    }))
  },

  saveFile: async (
    filenameToSave?: string,
    options?: FileHygieneOptions,
  ): Promise<void> => {
    if (!filenameToSave) return
    const rootPath = get().rootWorkspacePath
    const clean = rootPath
      ? normalizeWorkspacePath(filenameToSave, rootPath)
      : filenameToSave
    const targetKey = get().fileBuffers[clean]
      ? clean
      : get().fileBuffers[filenameToSave]
        ? filenameToSave
        : clean

    const buf = get().fileBuffers[targetKey]
    if (buf?.isLargeFile || buf?.isBinary) {
      get().showToast?.(
        "Cannot overwrite file: opened in read-only preview mode.",
      )
      return
    }
    const originalContent = buf?.content ?? ""
    let contentToSave = originalContent
    if (buf && options) {
      contentToSave = sanitizeContentOnSave(contentToSave, options)
    }

    if (buf) {
      try {
        await saveWorkspaceFile(clean, contentToSave, false)
      } catch (err: any) {
        console.error("Failed to save to backend:", err)
        get().showToast?.(
          `Save failed: ${err.message || "Failed to write file"}`,
        )
        return
      }
    }

    set((state) => {
      const currentBuf = state.fileBuffers[targetKey]
      if (!currentBuf) return state

      // If hygiene options transformed the content and user didn't type during save, apply hygiene to content
      if (
        options &&
        contentToSave !== originalContent &&
        currentBuf.content === originalContent
      ) {
        return {
          fileBuffers: {
            ...state.fileBuffers,
            [targetKey]: {
              ...currentBuf,
              content: contentToSave,
              savedContent: contentToSave,
              isDirty: false,
              lastSaved: Date.now(),
            },
          },
        }
      }

      const marked = markBufferSavedLogic(
        state.fileBuffers,
        targetKey,
        contentToSave,
      )
      return { fileBuffers: marked }
    })

    const linterSettings = get().linterSettings
    if (linterSettings.enabled && buf && !isLspLanguage(clean)) {
      triggerOffloadedLint(
        clean,
        contentToSave,
        linterSettings.showWarnings,
        set,
        0,
      )
    } else if (isLspLanguage(clean)) {
      const lang = detectLanguage(clean).toLowerCase()
      void notifyLspDidSave(clean, contentToSave, lang)
    }

    // Cross-slice Git refresh
    if (typeof get().refreshGit === "function") {
      void get().refreshGit()
    }

    get().showToast?.(`Saved ${clean}`)
  },

  applyCodeWithReview: async (
    targetPath: string,
    code: string,
  ): Promise<boolean> => {
    const rawPath = targetPath.trim()
    if (!rawPath) {
      get().showToast?.("Cannot apply: target file path is empty")
      return false
    }

    const rootPath = get().rootWorkspacePath
    const cleanPath = rootPath
      ? normalizeWorkspacePath(rawPath, rootPath)
      : normalizeWorkspacePath(rawPath)

    if (!cleanPath) {
      get().showToast?.("Cannot apply: invalid file path")
      return false
    }

    const existingBuf =
      get().fileBuffers[cleanPath] || get().fileBuffers[rawPath]
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

    set((state) => {
      const nextBuffers = { ...state.fileBuffers }
      if (rawPath !== cleanPath && nextBuffers[rawPath]) {
        delete nextBuffers[rawPath]
      }
      const curBuf = state.fileBuffers[cleanPath] || state.fileBuffers[rawPath]
      // Preserve any keystrokes typed by the user while saveWorkspaceFile was in flight
      const currentContent =
        curBuf && curBuf.content !== existingBuf?.content
          ? curBuf.content
          : code
      const isDirty = currentContent !== code

      nextBuffers[cleanPath] = {
        content: currentContent,
        savedContent: code,
        isDirty,
        hasDiskConflict: false,
        language: detectLanguage(cleanPath),
        lastSaved: Date.now(),
      }
      return { fileBuffers: nextBuffers }
    })

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
    const rootPath = get().rootWorkspacePath
    const clean = rootPath
      ? normalizeWorkspacePath(filename, rootPath)
      : filename
    const targetKey = get().fileBuffers[clean]
      ? clean
      : get().fileBuffers[filename]
        ? filename
        : clean
    set((state) => ({
      fileBuffers: revertBufferContentLogic(state.fileBuffers, targetKey),
    }))
    const buf = get().fileBuffers[targetKey]
    const reverted = buf?.savedContent ?? buf?.content ?? ""
    const linterSettings = get().linterSettings
    if (linterSettings.enabled && !isLspLanguage(clean)) {
      triggerOffloadedLint(clean, reverted, linterSettings.showWarnings, set, 0)
    }
    get().showToast?.(`Reverted changes to ${clean}`)
  },

  ensureFileBuffer: (filename: string) => {
    if (
      !filename ||
      isGraphTab(filename) ||
      isGitDiffTab(filename) ||
      isSettingsTab(filename)
    )
      return
    const rootPath = get().rootWorkspacePath
    const clean = rootPath
      ? normalizeWorkspacePath(filename, rootPath)
      : filename.replace(/^\/+/, "")
    const current = get().fileBuffers[clean] || get().fileBuffers[filename]
    if (current?.status === "loading") {
      return
    }
    if (
      !current ||
      current.status === "idle" ||
      (current.content === "" &&
        !current.isDirty &&
        !current.isLargeFile &&
        !current.isBinary &&
        current.status !== "ready")
    ) {
      return get().fetchBufferSafely(filename)
    }
  },

  fetchBufferSafely: async (filename: string): Promise<void> => {
    if (
      !filename ||
      isGraphTab(filename) ||
      isGitDiffTab(filename) ||
      isSettingsTab(filename)
    )
      return
    let rootPath = get().rootWorkspacePath
    if (!rootPath) {
      try {
        const info = await fetchWorkspaceInfo()
        if (info?.rootPath) {
          rootPath = normalizeWorkspacePath(info.rootPath)
          set({ rootWorkspacePath: rootPath, rootWorkspaceName: info.name })
        }
      } catch {
        // ignore if offline
      }
    }
    let clean = rootPath
      ? normalizeWorkspacePath(filename, rootPath)
      : filename.replace(/^\/+/, "")
    if (!clean) return

    const files = get().files || []
    if (!files.some((f) => f.path === clean)) {
      const match = files.find(
        (f) =>
          f.type !== "folder" &&
          (f.path === clean ||
            f.path?.endsWith("/" + clean) ||
            clean.endsWith("/" + f.path) ||
            f.name === clean ||
            clean.split("/").pop() === f.name),
      )
      if (match?.path) {
        clean = match.path
      }
    }

    const currentEpoch = get().workspaceEpoch
    const fetchToken = (fileFetchTokens[clean] =
      (fileFetchTokens[clean] || 0) + 1)
    const existing = get().fileBuffers[clean]
    if (!existing) {
      set((state) => ({
        fileBuffers: {
          ...state.fileBuffers,
          [clean]: {
            content: "",
            savedContent: "",
            isDirty: false,
            hasDiskConflict: false,
            isDeletedOnDisk: false,
            language: detectLanguage(clean),
            status: "loading",
          },
        },
      }))
    } else if (existing.status !== "ready" && existing.status !== "loading") {
      set((state) => ({
        fileBuffers: {
          ...state.fileBuffers,
          [clean]: {
            ...existing,
            status: "loading",
          },
        },
      }))
    }

    try {
      const detail = await fetchFileDetailed(clean)
      if (
        get().workspaceEpoch !== currentEpoch ||
        fileFetchTokens[clean] !== fetchToken
      ) {
        return
      }
      const content = detail.content
      set((state) => {
        const existingBuf = state.fileBuffers[clean]
        if (existingBuf?.isDirty) {
          if (
            content === existingBuf.savedContent ||
            content === existingBuf.content
          ) {
            return state
          }
          return {
            fileBuffers: {
              ...state.fileBuffers,
              [clean]: {
                ...existingBuf,
                hasDiskConflict: true,
                status: "ready",
              },
            },
          }
        }
        if (
          existingBuf &&
          existingBuf.content === content &&
          existingBuf.status === "ready" &&
          !existingBuf.hasDiskConflict
        ) {
          return state
        }
        const newBuf: FileBuffer = {
          content,
          savedContent: content,
          isDirty: false,
          hasDiskConflict: false,
          isDeletedOnDisk: false,
          language: detectLanguage(clean),
          isLargeFile: detail.isLarge,
          isBinary: detail.isBinary,
          fileSize: detail.size,
          status: "ready",
        }
        return {
          fileBuffers: {
            ...state.fileBuffers,
            [clean]: newBuf,
          },
        }
      })
      if (get().linterSettings.enabled && !isLspLanguage(clean)) {
        triggerOffloadedLint(clean, content, true, set, 0)
      }
    } catch (err) {
      if (
        get().workspaceEpoch !== currentEpoch ||
        fileFetchTokens[clean] !== fetchToken
      ) {
        return
      }
      set((state) => {
        const existingBuf = state.fileBuffers[clean]
        return {
          fileBuffers: {
            ...state.fileBuffers,
            [clean]: {
              ...(existingBuf || {
                content: "",
                savedContent: "",
                isDirty: false,
                hasDiskConflict: false,
                isDeletedOnDisk: false,
                language: detectLanguage(clean),
              }),
              status: "error",
            },
          },
        }
      })
      if (typeof process === "undefined" || !process.env?.VITEST) {
        console.warn(`Failed to fetch file content for ${clean}:`, err)
      }
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
  setLinterSettings: (updater) => {
    const current = (get() as any).settings?.linter ?? get().linterSettings
    const nextLinter =
      typeof updater === "function"
        ? updater(current)
        : { ...current, ...updater }
    if (typeof (get() as any).updateLinterSettings === "function") {
      ;(get() as any).updateLinterSettings(nextLinter)
    }
    set({ linterSettings: nextLinter })
  },

  navigateToDiagnostic: (diag: DiagnosticItem) => {
    let filename = ""
    let line = 1
    let col = 1

    const bracketMatch = diag.location.match(/^([^[\s]+)\s*\[(\d+),\s*(\d+)\]/)
    const colonMatch = diag.location.match(/^([^:\s]+):(\d+)(?::(\d+))?/)
    const parenMatch = diag.location.match(
      /^([^(\s]+)\s*\(\s*(\d+)(?:,\s*(\d+))?\s*\)/,
    )

    if (bracketMatch) {
      filename = bracketMatch[1]
      line = parseInt(bracketMatch[2], 10)
      col = parseInt(bracketMatch[3], 10)
    } else if (colonMatch) {
      filename = colonMatch[1]
      line = parseInt(colonMatch[2], 10)
      col = colonMatch[3] ? parseInt(colonMatch[3], 10) : 1
    } else if (parenMatch) {
      filename = parenMatch[1]
      line = parseInt(parenMatch[2], 10)
      col = parenMatch[3] ? parseInt(parenMatch[3], 10) : 1
    }

    if (filename) {
      if (typeof get().openFileInPane === "function") {
        get().openFileInPane(filename)
      }
      if (typeof get().setCursorPosition === "function") {
        get().setCursorPosition({ line, col })
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<GotoLineEventDetail>("aegis:editor-goto-line", {
            detail: {
              file: filename,
              line,
              col,
              preventFocus: false,
            },
          }),
        )
        // Ensure mounted/transitioning editor catches the jump
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent<GotoLineEventDetail>("aegis:editor-goto-line", {
              detail: {
                file: filename,
                line,
                col,
                preventFocus: false,
              },
            }),
          )
        }, 50)
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
        const contentToSave = buf.content
        try {
          await saveWorkspaceFile(filename, contentToSave, false)
          set((state) => ({
            fileBuffers: markBufferSavedLogic(
              state.fileBuffers,
              filename,
              contentToSave,
            ),
          }))
        } catch (err) {
          console.warn(`Failed to auto-save dirty buffer for ${filename}:`, err)
        }
      }
    }
  },
})

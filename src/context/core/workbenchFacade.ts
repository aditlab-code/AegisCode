import { useCallback, useEffect, useRef, useState } from "react"
import { useLayoutCore } from "./layoutCore"
import { useEditorCore } from "./editorCore"
import { useWorkspaceCore, type CursorCoordinates } from "./workspaceCore"
import { useGitCore } from "./gitCore"
import { useTerminalCore } from "./terminalCore"
import { useChatCore } from "./chatCore"
import { useSettingsCore } from "./settingsCore"
import { detectLanguage, validateSyntax } from "../../utils/linter"
import {
  isGitDiffTab,
  makeGitDiffTab,
  parseGitDiffTab,
} from "../../utils/gitDiffTab"
import type { WorkspaceChangeEvent } from "../../types/workbench"

export interface ConfirmCloseState {
  group: "group1" | "group2"
  filename: string
}

export function useWorkbenchFacade() {
  // Toast notifications
  const [toast, setToast] = useState("")
  const toastTimerRef = useRef<number | null>(null)
  const addNotificationRef = useRef<((
    title: string,
    detail?: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void) | null>(null)

  const [confirmCloseFile, setConfirmCloseFile] =
    useState<ConfirmCloseState | null>(null)
  const [confirmRevertFile, setConfirmRevertFile] = useState<string | null>(
    null,
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    if (typeof window !== "undefined") {
      toastTimerRef.current = window.setTimeout(() => setToast(""), 2200)
    }
    if (addNotificationRef.current) {
      addNotificationRef.current(message)
    }
  }, [])

  const clearToast = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    setToast("")
  }, [])

  // Server health state
  const [serverConnected, setServerConnected] = useState<boolean>(true)

  const checkServerConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/workspace/info", { method: "GET" })
      setServerConnected(res.ok)
      return res.ok
    } catch {
      setServerConnected(false)
      return false
    }
  }, [])

  useEffect(() => {
    checkServerConnection()
    const timer = setInterval(() => {
      checkServerConnection()
    }, 20000)
    return () => clearInterval(timer)
  }, [checkServerConnection])

  // Sub-modules
  const layout = useLayoutCore()
  const terminal = useTerminalCore()
  const chat = useChatCore()
  const settingsCore = useSettingsCore()

  const workspaceRef = useRef<{
    ensureFileBuffer: (file: string) => void
  } | null>(null)

  const onFileRequested = useCallback((filename: string) => {
    if (workspaceRef.current) {
      if (isGitDiffTab(filename)) {
        const diffInfo = parseGitDiffTab(filename)
        if (diffInfo?.file) {
          workspaceRef.current.ensureFileBuffer(diffInfo.file)
        }
      } else {
        workspaceRef.current.ensureFileBuffer(filename)
      }
    }
  }, [])

  const editor = useEditorCore(onFileRequested)
  const editorRef = useRef(editor)
  editorRef.current = editor

  const gitRef = useRef<ReturnType<typeof useGitCore> | null>(null)

  const onFileRenamed = useCallback((oldPath: string, newPath: string) => {
    editorRef.current.renameTabsInBothGroups(oldPath, newPath)
  }, [])

  const onFileDeleted = useCallback((filename: string) => {
    editorRef.current.closeTabInBothGroups(filename)
  }, [])

  const onWorkspaceCleared = useCallback(() => {
    editorRef.current.resetAllGroups()
  }, [])

  const onGitStatusUpdated = useCallback(() => {
    gitRef.current?.refreshGit()
  }, [])

  const openFileInPane = useCallback((filename: string) => {
    editorRef.current.openFileInPane(filename)
  }, [])

  const openGitDiff = useCallback(
    (file: string, staged = false, commit = "") => {
      const tabId = makeGitDiffTab(file, staged, commit)
      editorRef.current.openFileInPane(tabId)
    },
    [],
  )

  const setCursorPosition = useCallback((pos: CursorCoordinates) => {
    editorRef.current.setCursorPosition(pos)
  }, [])

  const [gitDiffVersion, setGitDiffVersion] = useState(0)

  const onFilesChangedOnDisk = useCallback((_evt: WorkspaceChangeEvent) => {
    gitRef.current?.refreshGit()
    setGitDiffVersion((v) => v + 1)
  }, [])

  const workspace = useWorkspaceCore({
    onFileRenamed,
    onFileDeleted,
    onWorkspaceCleared,
    onGitStatusUpdated,
    showToast,
    openFileInPane,
    setCursorPosition,
    onFilesChangedOnDisk,
  })
  addNotificationRef.current = workspace.addNotification

  const git = useGitCore({
    showToast,
    rootWorkspacePath: workspace.rootWorkspacePath,
  })
  gitRef.current = git

  useEffect(() => {
    workspaceRef.current = {
      ensureFileBuffer: workspace.ensureFileBuffer,
    }
  }, [workspace.ensureFileBuffer])

  // Cross-domain coordination: Language & Reactive Auto-Linting on focused file change
  const currentFocusedFile = editor.currentFocusedFile

  useEffect(() => {
    if (currentFocusedFile) {
      workspace.setActiveLanguage(detectLanguage(currentFocusedFile))
    }
  }, [currentFocusedFile, workspace])

  useEffect(() => {
    if (
      !workspace.linterSettings.enabled ||
      workspace.linterSettings.trigger !== "onType"
    ) {
      if (!workspace.linterSettings.enabled) {
        workspace.setDiagnostics([])
      }
      return
    }

    const timer = setTimeout(() => {
      if (currentFocusedFile) {
        const buffer = workspace.fileBuffers[currentFocusedFile]
        if (buffer) {
          const fileDiags = validateSyntax(
            currentFocusedFile,
            buffer.content,
            workspace.linterSettings.showWarnings,
          )
          workspace.setDiagnostics((prev) => [
            ...prev.filter((d) => !d.location.startsWith(currentFocusedFile)),
            ...fileDiags,
          ])
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [
    currentFocusedFile,
    workspace.fileBuffers,
    workspace.linterSettings,
    workspace,
  ])

  const saveFile = useCallback(
    async (filenameToSave?: string) => {
      const target = filenameToSave || editor.activeTab
      const hygiene = {
        trimTrailingWhitespace:
          settingsCore.settings.files.trimTrailingWhitespace,
        insertFinalNewline: settingsCore.settings.files.insertFinalNewline,
        eol: settingsCore.settings.files.eol,
      }
      await workspace.saveFile(target, hygiene)
      await gitRef.current?.refreshGit()
    },
    [editor.activeTab, settingsCore.settings.files, workspace],
  )

  // Auto-Save Engine: afterDelay
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    const { autoSave, autoSaveDelay } = settingsCore.settings.files
    if (autoSave !== "afterDelay") return

    const dirtyFiles = Object.entries(workspace.fileBuffers)
      .filter(([_, buf]) => buf.isDirty)
      .map(([filename]) => filename)

    if (dirtyFiles.length === 0) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(
      async () => {
        for (const file of dirtyFiles) {
          await saveFile(file)
        }
      },
      Math.max(300, autoSaveDelay || 1000),
    )

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [workspace.fileBuffers, settingsCore.settings.files, saveFile])

  // Auto-Save Engine: onFocusChange
  useEffect(() => {
    const { autoSave } = settingsCore.settings.files
    if (autoSave !== "onFocusChange" || typeof window === "undefined") return

    const handleWindowBlur = () => {
      const dirtyFiles = Object.entries(workspace.fileBuffers)
        .filter(([_, buf]) => buf.isDirty)
        .map(([filename]) => filename)

      for (const file of dirtyFiles) {
        saveFile(file)
      }
    }

    window.addEventListener("blur", handleWindowBlur)
    return () => {
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [workspace.fileBuffers, settingsCore.settings.files, saveFile])

  const createFileAndOpen = useCallback(
    async (name: string, isFolder = false, parentFolder?: string) => {
      const newPath = await workspace.createFile(name, isFolder, parentFolder)
      if (newPath && !isFolder) {
        editor.openFileInGroup(newPath, editor.focusedGroup)
      }
    },
    [editor, workspace],
  )

  const closeTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      const buf = workspace.fileBuffers[filename]
      if (buf?.isDirty) {
        setConfirmCloseFile({ group, filename })
        return
      }
      editor.closeTabInGroup(group, filename)
    },
    [editor, workspace.fileBuffers],
  )

  const forceCloseTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      editor.closeTabInGroup(group, filename)
    },
    [editor],
  )

  const closeTab = useCallback(
    (tabToClose?: string) => {
      const target = tabToClose || editor.activeTab
      if (!target) return
      closeTabInGroup(editor.focusedGroup, target)
    },
    [closeTabInGroup, editor.activeTab, editor.focusedGroup],
  )

  const resolveConfirmCloseFile = useCallback(
    async (action: "save" | "dont-save" | "cancel") => {
      if (!confirmCloseFile) return
      const { group, filename } = confirmCloseFile
      if (action === "save") {
        await workspace.saveFile(filename)
        editor.closeTabInGroup(group, filename)
        setConfirmCloseFile(null)
      } else if (action === "dont-save") {
        workspace.revertBufferContent(filename)
        editor.closeTabInGroup(group, filename)
        setConfirmCloseFile(null)
      } else if (action === "cancel") {
        setConfirmCloseFile(null)
      }
    },
    [confirmCloseFile, editor, workspace],
  )

  const requestRevertFile = useCallback(
    (filenameToRevert?: string) => {
      const target =
        filenameToRevert ||
        (editor.focusedGroup === "group2"
          ? editor.group2.activeTab
          : editor.group1.activeTab)
      if (!target) return
      const buf = workspace.fileBuffers[target]
      if (buf?.isDirty) {
        setConfirmRevertFile(target)
      }
    },
    [
      editor.focusedGroup,
      editor.group1.activeTab,
      editor.group2.activeTab,
      workspace.fileBuffers,
    ],
  )

  const resolveConfirmRevert = useCallback(
    (confirm: boolean) => {
      if (!confirmRevertFile) return
      if (confirm) {
        workspace.revertBufferContent(confirmRevertFile)
      }
      setConfirmRevertFile(null)
    },
    [confirmRevertFile, workspace],
  )

  // Global command action dispatcher
  const runAction = useCallback(
    (action: string) => {
      const actionMessages: Record<string, string> = {
        "clear-terminal": "Terminal output cleared",
        find: `Find widget opened for ${editor.activeTab}`,
        "new-file": "Untitled-1 created",
        "open-folder": "Folder picker ready",
        redo: "Nothing to redo",
        run: "Run session queued without debugging",
        "run-file": `Running ${editor.activeTab}`,
        stop: "Active run session stopped",
        undo: "Last editor action reverted",
      }

      if (action === "commands") {
        layout.setCommandPaletteOpen(true)
      } else if (action === "open-folder") {
        workspace.openFolderPicker()
      } else if (action === "close-folder") {
        workspace.closeRootFolder()
      } else if (action === "sidebar") {
        layout.toggleSidebar()
      } else if (action === "panel" || action === "new-terminal") {
        layout.togglePanel()
      } else if (action === "save") {
        saveFile()
      } else {
        showToast(actionMessages[action] ?? "Command completed")
      }
    },
    [editor.activeTab, layout, saveFile, showToast, workspace],
  )

  // Global keyboard shortcuts
  useEffect(() => {
    if (typeof window === "undefined") return

    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")
      ) {
        event.preventDefault()
        layout.setCommandPaletteOpen((prev) => !prev)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        layout.toggleSidebar()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        layout.togglePanel()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        saveFile()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        layout.toggleSettingsModal()
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        layout.setSidebarOpen(true)
        editor.setActiveActivity("Search")
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        editor.openFind(editor.focusedGroup, false)
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "h"
      ) {
        event.preventDefault()
        editor.openFind(editor.focusedGroup, true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault()
        const currentGroup =
          editor.focusedGroup === "group2" ? editor.group2 : editor.group1
        if (currentGroup.activeTab) {
          closeTabInGroup(currentGroup.id, currentGroup.activeTab)
        }
        return
      }
      if (event.key === "Escape") {
        if (confirmRevertFile) {
          setConfirmRevertFile(null)
          return
        }
        if (confirmCloseFile) {
          setConfirmCloseFile(null)
          return
        }
        layout.setCommandPaletteOpen(false)
        layout.setSettingsModalOpen(false)
        editor.closeFind()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    closeTabInGroup,
    confirmCloseFile,
    confirmRevertFile,
    editor,
    layout,
    saveFile,
  ])

  return {
    // Layout
    sidebarOpen: layout.sidebarOpen,
    setSidebarOpen: layout.setSidebarOpen,
    toggleSidebar: layout.toggleSidebar,
    panelOpen: layout.panelOpen,
    setPanelOpen: layout.setPanelOpen,
    togglePanel: layout.togglePanel,
    panelMaximized: layout.panelMaximized,
    setPanelMaximized: layout.setPanelMaximized,
    togglePanelMaximized: layout.togglePanelMaximized,
    activeBottomTab: layout.activeBottomTab,
    setActiveBottomTab: layout.setActiveBottomTab,
    bottomTabOrder: layout.bottomTabOrder,
    reorderBottomTabs: layout.reorderBottomTabs,
    chatOpen: layout.chatOpen,
    setChatOpen: layout.setChatOpen,
    toggleChat: layout.toggleChat,
    chatSessionsOpen: layout.chatSessionsOpen,
    setChatSessionsOpen: layout.setChatSessionsOpen,
    toggleChatSessions: layout.toggleChatSessions,
    commandPaletteOpen: layout.commandPaletteOpen,
    setCommandPaletteOpen: layout.setCommandPaletteOpen,
    commandPaletteQuery: layout.commandPaletteQuery,
    setCommandPaletteQuery: layout.setCommandPaletteQuery,
    settingsModalOpen: layout.settingsModalOpen,
    setSettingsModalOpen: layout.setSettingsModalOpen,
    toggleSettingsModal: layout.toggleSettingsModal,
    theme: settingsCore.settings.workbench.appearance.mode,
    themePalette: settingsCore.settings.workbench.appearance.palette,
    setTheme: (mode: ThemeMode) => {
      layout.setTheme(mode)
      settingsCore.setThemeMode(mode)
    },
    setThemePalette: settingsCore.setThemePalette,
    toggleTheme: () => {
      layout.toggleTheme()
      settingsCore.toggleThemeMode()
    },
    settings: settingsCore.settings,
    setSettings: settingsCore.setSettings,
    updateEditorSettings: settingsCore.updateEditorSettings,
    updateWorkbenchSettings: settingsCore.updateWorkbenchSettings,
    updateFilesSettings: settingsCore.updateFilesSettings,
    updateFeaturesSettings: settingsCore.updateFeaturesSettings,
    updateCompanionSettings: settingsCore.updateCompanionSettings,
    updateLinterSettings: settingsCore.updateLinterSettings,
    updateAgentSettings: settingsCore.updateAgentSettings,
    resetSettings: settingsCore.resetSettings,
    sidebarWidth: layout.sidebarWidth,
    setSidebarWidth: layout.setSidebarWidth,
    resetSidebarWidth: layout.resetSidebarWidth,
    chatDrawerWidth: layout.chatDrawerWidth,
    setChatDrawerWidth: layout.setChatDrawerWidth,
    resetChatDrawerWidth: layout.resetChatDrawerWidth,
    bottomPanelHeight: layout.bottomPanelHeight,
    setBottomPanelHeight: layout.setBottomPanelHeight,
    resetBottomPanelHeight: layout.resetBottomPanelHeight,

    // Editor
    minimapEnabled: settingsCore.settings.editor.minimapEnabled,
    setMinimapEnabled: (val: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof val === "function"
          ? val(settingsCore.settings.editor.minimapEnabled)
          : val
      editor.setMinimapEnabled(next)
      settingsCore.updateEditorSettings({ minimapEnabled: next })
    },
    toggleMinimap: () => {
      const next = !settingsCore.settings.editor.minimapEnabled
      editor.setMinimapEnabled(next)
      settingsCore.updateEditorSettings({ minimapEnabled: next })
    },
    minimapScale: settingsCore.settings.editor.minimapScale,
    setMinimapScale: (scale: MinimapScale) => {
      editor.setMinimapScale(scale)
      settingsCore.updateEditorSettings({ minimapScale: scale })
    },
    findStateGroup1: editor.findStateGroup1,
    findStateGroup2: editor.findStateGroup2,
    setFindStateGroup1: editor.setFindStateGroup1,
    setFindStateGroup2: editor.setFindStateGroup2,
    openFind: editor.openFind,
    closeFind: editor.closeFind,
    toggleFind: editor.toggleFind,
    splitEditor: editor.splitEditor,
    setSplitEditor: editor.setSplitEditor,
    toggleSplitEditor: editor.toggleSplitEditor,
    closeSplitEditor: editor.closeSplitEditor,
    splitRatio: editor.splitRatio,
    setSplitRatio: editor.setSplitRatio,
    group1: editor.group1,
    group2: editor.group2,
    focusedGroup: editor.focusedGroup,
    setFocusedGroup: editor.setFocusedGroup,
    openFileInGroup: editor.openFileInGroup,
    closeTabInGroup,
    forceCloseTabInGroup,
    setActiveTabInGroup: editor.setActiveTabInGroup,
    moveTabBetweenGroups: editor.moveTabBetweenGroups,
    reorderTabsInGroup: editor.reorderTabsInGroup,
    focusedPane: editor.focusedPane,
    setFocusedPane: editor.setFocusedPane,
    secondaryActiveTab: editor.secondaryActiveTab,
    setSecondaryActiveTab: editor.setSecondaryActiveTab,
    openFileInPane: editor.openFileInPane,
    activeActivity: editor.activeActivity,
    setActiveActivity: editor.setActiveActivity,
    activeTab: editor.activeTab,
    setActiveTab: editor.setActiveTab,
    tabs: editor.tabs,
    closeTab,
    confirmCloseFile,
    setConfirmCloseFile,
    resolveConfirmCloseFile,
    confirmRevertFile,
    setConfirmRevertFile,
    requestRevertFile,
    resolveConfirmRevert,
    revertFile: workspace.revertBufferContent,
    activeLanguage: workspace.activeLanguage,
    setActiveLanguage: workspace.setActiveLanguage,

    // Buffer & Linter & Cursor
    fileBuffers: workspace.fileBuffers,
    updateFileContent: workspace.updateFileContent,
    saveFile,
    cursorPosition: editor.cursorPosition,
    setCursorPosition: editor.setCursorPosition,
    tabSize: settingsCore.settings.editor.tabSize,
    setTabSize: (size: number) => {
      editor.setTabSize(size)
      settingsCore.updateEditorSettings({ tabSize: size })
    },
    toggleTabSize: () => {
      const next = settingsCore.settings.editor.tabSize === 2 ? 4 : 2
      editor.setTabSize(next)
      settingsCore.updateEditorSettings({ tabSize: next })
    },
    encoding: editor.encoding,
    setEncoding: editor.setEncoding,
    linterSettings: settingsCore.settings.linter,
    setLinterSettings: (updater: any) => {
      workspace.setLinterSettings(updater)
      settingsCore.updateLinterSettings(updater)
    },
    navigateToDiagnostic: workspace.navigateToDiagnostic,

    // Workspace & Root
    rootWorkspacePath: workspace.rootWorkspacePath,
    rootWorkspaceName: workspace.rootWorkspaceName,
    isWorkspaceLoading: workspace.isWorkspaceLoading,
    recentProjects: workspace.recentProjects,
    addRecentProject: workspace.addRecentProject,
    removeRecentProject: workspace.removeRecentProject,
    clearRecentProjects: workspace.clearRecentProjects,
    openFolderPicker: workspace.openFolderPicker,
    openRootFolder: workspace.openRootFolder,
    closeRootFolder: workspace.closeRootFolder,
    safeOpenRootFolder: workspace.openRootFolder,
    safeCloseRootFolder: workspace.closeRootFolder,
    refreshWorkspace: workspace.refreshWorkspace,
    moveFile: workspace.moveFile,
    files: workspace.files,
    setFiles: workspace.setFiles,
    createFile: createFileAndOpen,
    renameFile: workspace.renameFile,
    deleteFile: workspace.deleteFile,
    diagnostics: workspace.diagnostics,
    notifications: workspace.notifications,
    addNotification: workspace.addNotification,
    clearAllNotifications: workspace.clearAllNotifications,
    removeNotification: workspace.removeNotification,
    markAllNotificationsRead: workspace.markAllNotificationsRead,
    markNotificationRead: workspace.markNotificationRead,

    // Git
    isGitRepo: git.isGitRepo,
    activeBranch: git.activeBranch,
    setActiveBranch: git.setActiveBranch,
    activeRepo: git.activeRepo,
    setActiveRepo: git.setActiveRepo,
    gitRepos: git.gitRepos,
    gitChanges: git.gitChanges,
    stagedChanges: git.stagedChanges,
    gitCommits: git.gitCommits,
    gitBranches: git.gitBranches,
    gitTags: git.gitTags,
    gitProfile: git.gitProfile,
    ahead: git.ahead,
    behind: git.behind,
    upstream: git.upstream,
    commitHash: git.commitHash,
    isLoadingGit: git.isLoadingGit,
    gitError: git.gitError,
    refreshGit: git.refreshGit,
    initRepo: git.initRepo,
    checkoutBranch: git.checkoutBranch,
    createBranch: git.createBranch,
    stageChange: git.stageChange,
    unstageChange: git.unstageChange,
    stageAllChanges: git.stageAllChanges,
    unstageAllChanges: git.unstageAllChanges,
    discardChange: git.discardChange,
    discardAllChanges: git.discardAllChanges,
    commitChanges: git.commitChanges,
    gitPull: git.gitPull,
    gitPush: git.gitPush,
    gitSync: git.gitSync,
    createTag: git.createTag,
    pushTags: git.pushTags,
    addRemote: git.addRemote,
    fetchDiff: git.fetchDiff,
    fetchTimeline: git.fetchTimeline,
    openGitDiff,
    gitDiffVersion,

    // Terminal
    terminalSessions: terminal.terminalSessions,
    activeTerminalSessionId: terminal.activeTerminalSessionId,
    activeTerminalSession: terminal.activeTerminalSession,
    setActiveTerminalSessionId: terminal.setActiveTerminalSessionId,
    createTerminalSession: terminal.createTerminalSession,
    closeTerminalSession: terminal.closeTerminalSession,
    terminalLines: terminal.terminalLines,
    terminalRunning: terminal.terminalRunning,
    setTerminalRunning: terminal.setTerminalRunning,
    sendTerminalCommand: terminal.sendTerminalCommand,
    clearTerminal: terminal.clearTerminal,

    // Chat
    sessions: chat.sessions,
    activeSessionId: chat.activeSessionId,
    activeSession: chat.activeSession,
    activeProvider: chat.activeProvider,
    activeModel: chat.activeModel,
    createSession: chat.createSession,
    switchSession: chat.switchSession,
    deleteSession: chat.deleteSession,
    setSessionModel: chat.setSessionModel,
    chatMessages: chat.chatMessages,
    sendChatMessage: chat.sendChatMessage,

    // Global
    toast,
    showToast,
    clearToast,
    serverConnected,
    checkServerConnection,
    runAction,
  }
}

export type WorkbenchContextType = ReturnType<typeof useWorkbenchFacade>

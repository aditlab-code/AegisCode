import type { StateCreator } from "zustand"
import type {
  ActivityType,
  AppSettings,
  BottomTab,
  TerminalSession,
  ChatMessage,
  ChatProvider,
  ChatSession,
  ContextItem,
  CursorPosition,
  DebugState,
  DiagnosticItem,
  EditorGroupState,
  EditorSelectionRange,
  EditorSettings,
  FeaturesSettings,
  FileBuffer,
  FileItem,
  FilesSettings,
  FindWidgetState,
  GitBranch,
  GitChange,
  GitCommitNode,
  GitDiffResult,
  GitCompareResult,
  GitRepo,
  GitUser,
  LinterSettings,
  MinimapScale,
  NotificationItem,
  ProviderModel,
  SkillCommand,
  ThemeMode,
  ThemePaletteId,
  WorkbenchAppearanceSettings,
  AgentSettings,
  CompanionSettings,
} from "../types/workbench"
import type { CursorCoordinates } from "../context/core/workspaceCore"
import type { ConfirmCloseState } from "../context/core/workbenchFacade"

export type SliceCreator<T> = StateCreator<WorkbenchStore, [], [], T>

export interface ActiveDebugLine {
  file: string
  line: number
}

export interface LayoutSlice {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  togglePanel: () => void
  panelMaximized: boolean
  setPanelMaximized: (max: boolean | ((prev: boolean) => boolean)) => void
  togglePanelMaximized: () => void
  activeBottomTab: BottomTab
  setActiveBottomTab: (tab: BottomTab) => void
  bottomTabOrder: BottomTab[]
  reorderBottomTabs: (sourceIndex: number, targetIndex: number) => void
  chatOpen: boolean
  setChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  toggleChat: () => void
  chatSessionsOpen: boolean
  setChatSessionsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  toggleChatSessions: () => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  commandPaletteQuery: string
  setCommandPaletteQuery: (query: string) => void
  settingsModalOpen: boolean
  setSettingsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  settingsModalCategory: string
  setSettingsModalCategory: (cat: string) => void
  openSettingsModal: (category?: string) => void
  toggleSettingsModal: () => void
  theme: ThemeMode
  themePalette: ThemePaletteId
  setTheme: (mode: ThemeMode) => void
  setThemePalette: (palette: ThemePaletteId) => void
  toggleTheme: () => void
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
  resetSidebarWidth: () => void
  chatDrawerWidth: number
  setChatDrawerWidth: (w: number) => void
  resetChatDrawerWidth: () => void
  bottomPanelHeight: number
  setBottomPanelHeight: (h: number) => void
  resetBottomPanelHeight: () => void
}

export interface SettingsSlice {
  settings: AppSettings
  setSettings: (s: AppSettings | ((prev: AppSettings) => AppSettings)) => void
  updateEditorSettings: (patch: Partial<EditorSettings>) => void
  updateWorkbenchSettings: (
    patch: Partial<WorkbenchAppearanceSettings> | ((
      prev: WorkbenchAppearanceSettings,
    ) => WorkbenchAppearanceSettings),
  ) => void
  updateFilesSettings: (patch: Partial<FilesSettings>) => void
  updateFeaturesSettings: (patch: Partial<FeaturesSettings>) => void
  updateCompanionSettings: (patch: Partial<CompanionSettings>) => void
  updateLinterSettings: (
    updater: Partial<LinterSettings> | ((
      prev: LinterSettings,
    ) => LinterSettings),
  ) => void
  updateAgentSettings: (patch: Partial<AgentSettings>) => void
  resetSettings: () => void
  setThemeMode: (mode: ThemeMode) => void
  setThemePalette: (palette: ThemePaletteId) => void
  toggleThemeMode: () => void
}

export interface EditorSlice {
  splitEditor: boolean
  setSplitEditor: (split: boolean | ((prev: boolean) => boolean)) => void
  toggleSplitEditor: () => void
  closeSplitEditor: () => void
  splitRatio: number
  setSplitRatio: (ratio: number) => void
  group1: EditorGroupState
  group2: EditorGroupState
  focusedGroup: "group1" | "group2"
  setFocusedGroup: (g: "group1" | "group2") => void
  openFileInGroup: (filename: string, group?: "group1" | "group2") => void
  closeTabInGroup: (group: "group1" | "group2", filename: string) => void
  forceCloseTabInGroup: (group: "group1" | "group2", filename: string) => void
  setActiveTabInGroup: (group: "group1" | "group2", filename: string) => void
  moveTabBetweenGroups: {
    (filename: string, from: "group1" | "group2", to: "group1" | "group2"): void
    (
      sourceGroup: "group1" | "group2",
      targetGroup: "group1" | "group2",
      filename: string,
      targetIndex?: number,
    ): void
  }
  reorderTabsInGroup: (
    group: "group1" | "group2",
    sourceIndex: number,
    targetIndex: number,
  ) => void
  focusedPane: "primary" | "secondary"
  setFocusedPane: (p: "primary" | "secondary") => void
  secondaryActiveTab: string
  setSecondaryActiveTab: (tab: string) => void
  openFileInPane: (filename: string) => void
  activeActivity: ActivityType
  setActiveActivity: (a: ActivityType) => void
  activeTab: string
  setActiveTab: (t: string) => void
  tabs: string[]
  closeTab: (tabToClose?: string) => void
  closeAllTabs: (group?: "group1" | "group2") => void
  minimapEnabled: boolean
  setMinimapEnabled: (val: boolean | ((prev: boolean) => boolean)) => void
  toggleMinimap: () => void
  minimapScale: MinimapScale
  setMinimapScale: (scale: MinimapScale) => void
  findStateGroup1: FindWidgetState
  findStateGroup2: FindWidgetState
  setFindStateGroup1: (
    s: FindWidgetState | ((prev: FindWidgetState) => FindWidgetState),
  ) => void
  setFindStateGroup2: (
    s: FindWidgetState | ((prev: FindWidgetState) => FindWidgetState),
  ) => void
  openFind: (group: "group1" | "group2", replace?: boolean) => void
  closeFind: () => void
  toggleFind: (group: "group1" | "group2", replace?: boolean) => void
  cursorPosition: CursorCoordinates
  setCursorPosition: (pos: CursorCoordinates) => void
  selection: EditorSelectionRange
  setSelection: (sel: EditorSelectionRange) => void
  currentFocusedFile: string | null
  renameTabsInBothGroups: (oldPath: string, newPath: string) => void
  closeTabInBothGroups: (filename: string) => void
  resetAllGroups: () => void
  tabSize: number
  setTabSize: (size: number) => void
  toggleTabSize: () => void
  encoding: string
  setEncoding: (enc: string) => void
  breakpoints: Record<string, number[]>
  setBreakpointsMap: (
    updater: Record<string, number[]> | ((
      prev: Record<string, number[]>,
    ) => Record<string, number[]>),
  ) => void
  toggleBreakpoint: (file: string, line: number) => Promise<void>
  clearBreakpoints: () => void
  activeDebugLine: {
    file: string
    line: number
  } | null
  setActiveDebugLine: (
    line: {
      file: string
      line: number
    } | null,
  ) => void
  confirmCloseFile: ConfirmCloseState | null
  setConfirmCloseFile: (state: ConfirmCloseState | null) => void
  resolveConfirmCloseFile: (
    action: "save" | "dont-save" | "cancel",
  ) => Promise<void>
  confirmRevertFile: string | null
  setConfirmRevertFile: (file: string | null) => void
  requestRevertFile: (filenameToRevert?: string) => void
  resolveConfirmRevert: (confirm: boolean) => void
  revertFile: (filename: string) => void
}

export interface WorkspaceSlice {
  rootWorkspacePath: string
  rootWorkspaceName: string
  isWorkspaceLoading: boolean
  recentProjects: string[]
  addRecentProject: (path: string) => Promise<void>
  removeRecentProject: (path: string) => Promise<void>
  clearRecentProjects: () => Promise<void>
  openFolderPicker: () => Promise<void>
  openRootFolder: (folderPath: string) => Promise<void>
  closeRootFolder: () => Promise<void>
  safeOpenRootFolder: (folderPath: string) => Promise<void>
  safeCloseRootFolder: () => Promise<void>
  refreshWorkspace: () => Promise<void>
  moveFile: (oldPath: string, newPath: string) => Promise<void>
  files: FileItem[]
  setFiles: (files: FileItem[] | ((prev: FileItem[]) => FileItem[])) => void
  createFile: (
    name: string,
    isFolder?: boolean,
    parentFolder?: string,
  ) => Promise<string | undefined>
  renameFile: (oldPath: string, newName: string) => Promise<void>
  deleteFile: (name: string) => Promise<void>
  fileBuffers: Record<string, FileBuffer>
  setFileBuffers: (
    updater: Record<string, FileBuffer> | ((
      prev: Record<string, FileBuffer>,
    ) => Record<string, FileBuffer>),
  ) => void
  updateFileContent: (path: string, content: string) => void
  syncBufferWithDisk: (path: string, content: string) => void
  saveFile: (filenameToSave?: string) => Promise<void>
  applyCodeWithReview: (targetPath: string, code: string) => Promise<boolean>
  revertBufferContent: (path: string) => void
  ensureFileBuffer: (path: string) => Promise<void> | void
  fetchBufferSafely: (path: string) => Promise<void>
  diagnostics: DiagnosticItem[]
  setDiagnostics: (
    updater: DiagnosticItem[] | ((prev: DiagnosticItem[]) => DiagnosticItem[]),
  ) => void
  notifications: NotificationItem[]
  addNotification: (
    title: string,
    detail?: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void
  clearAllNotifications: () => void
  removeNotification: (id: string) => void
  markAllNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  activeLanguage: string
  setActiveLanguage: (lang: string) => void
  linterSettings: LinterSettings
  setLinterSettings: (updater: any) => void
  navigateToDiagnostic: (diag: DiagnosticItem) => void
  autoSaveDirtyBuffers: () => Promise<void>
}

export interface GitSlice {
  isGitRepo: boolean
  activeBranch: string
  setActiveBranch: (b: string) => Promise<boolean>
  activeRepo: string
  setActiveRepo: (r: string) => void
  gitRepos: GitRepo[]
  setGitRepos: (repos: GitRepo[]) => void
  gitChanges: GitChange[]
  setGitChanges: (
    updater: GitChange[] | ((prev: GitChange[]) => GitChange[]),
  ) => void
  stagedChanges: GitChange[]
  setStagedChanges: (
    updater: GitChange[] | ((prev: GitChange[]) => GitChange[]),
  ) => void
  gitCommits: GitCommitNode[]
  setGitCommits: (commits: GitCommitNode[]) => void
  gitBranches: GitBranch[]
  gitTags: string[]
  gitProfile: GitUser
  ahead: number
  behind: number
  upstream: string
  commitHash: string
  isLoadingGit: boolean
  gitError: string | null
  isRepoLocked: boolean
  isOperatingGit: boolean
  gitDiffVersion: number
  refreshGit: () => Promise<void>
  unlockRepo: () => Promise<boolean>
  initRepo: () => Promise<boolean>
  checkoutBranch: (b: string) => Promise<boolean>
  createBranch: (name: string) => Promise<boolean>
  stageChange: (file: string) => Promise<boolean>
  unstageChange: (file: string) => Promise<boolean>
  stageAllChanges: () => Promise<boolean>
  unstageAllChanges: () => Promise<boolean>
  discardChange: (file: string) => Promise<void>
  discardAllChanges: () => Promise<boolean>
  commitChanges: (msg: string) => Promise<boolean>
  checkoutCommit: (hash: string) => Promise<boolean>
  compareBaseCommit: string | null
  compareTargetCommit: string | null
  compareResult: GitCompareResult | null
  isLoadingCompare: boolean
  setCompareBaseCommit: (hash: string | null) => void
  compareCommits: (base: string, target: string) => Promise<void>
  clearCompare: () => void
  gitPull: () => Promise<boolean>
  gitPush: () => Promise<boolean>
  gitSync: () => Promise<boolean>
  createTag: (name: string) => Promise<boolean>
  pushTags: () => Promise<boolean>
  addRemote: (name: string, url: string) => Promise<boolean>
  fetchDiff: (
    file: string,
    staged?: boolean,
    commit?: string,
    base?: string,
  ) => Promise<GitDiffResult | null>
  fetchTimeline: (file?: string, limit?: number) => Promise<GitCommitNode[]>
  openGitDiff: (
    file: string,
    staged?: boolean,
    commit?: string,
    base?: string,
  ) => void
}

export interface TerminalSlice {
  terminalSessions: TerminalSession[]
  activeTerminalSessionId: string
  activeTerminalSession: TerminalSession | undefined
  setActiveTerminalSessionId: (id: string) => void
  createTerminalSession: (shellName?: string) => Promise<void>
  restartTerminalSession: (id?: string) => Promise<void>
  terminateTerminalSession: (id?: string) => Promise<void>
  closeTerminalSession: (id?: string) => Promise<void>
  terminalLines: string[]
  terminalRunning: boolean
  setTerminalRunning: (r: boolean) => void
  sendTerminalCommand: (cmd: string, sessionId?: string) => void
  clearTerminal: (sessionId?: string) => void
}

export interface ChatSlice {
  sessions: ChatSession[]
  activeSessionId: string
  activeSession: ChatSession | undefined
  activeProvider: ChatProvider
  activeModel: string
  chatMessages: ChatMessage[]
  isGenerating: boolean
  stopGenerating: () => void
  skills: SkillCommand[]
  antigravityModels: ProviderModel[]
  createSession: (provider?: ChatProvider, model?: string) => ChatSession
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  setSessionModel: (model: string) => void
  sendChatMessage: (text: string, customContext?: ContextItem[]) => void
  appendChatChunk: (sessionId: string, chunk: string) => void
  contextItems: ContextItem[]
  manualMentions: ContextItem[]
  dismissedPaths: string[]
  contextModeOverrides: Record<string, "selection" | "full">
  dismissContextItem: (id: string) => void
  toggleContextItemMode: (id: string) => void
  addMentionContext: (path: string) => Promise<void>
  clearManualMentions: () => void
}

export interface DebugSlice {
  debugState: DebugState
  isDebugging: boolean
  startDebugging: (program?: string) => Promise<boolean>
  stepDebugging: (
    action: "continue" | "stepOver" | "stepIn" | "stepOut" | "pause",
  ) => Promise<boolean>
  terminateDebugging: () => Promise<boolean>
  runFileInTerminal: (file?: string) => Promise<boolean>
  toast: string
  showToast: (msg: string) => void
  clearToast: () => void
  serverConnected: boolean
  checkServerConnection: () => Promise<boolean>
  runAction: (action: string) => void
}

export type WorkbenchStore = LayoutSlice & SettingsSlice & EditorSlice & WorkspaceSlice & GitSlice & TerminalSlice & ChatSlice & DebugSlice

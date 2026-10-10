import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type {
  ActivityType,
  BottomTab,
  ChatMessage,
  ChatProvider,
  ChatSession,
  CursorPosition,
  DiagnosticItem,
  EditorGroupState,
  FileBuffer,
  FileItem,
  GitChange,
  LinterSettings,
  NotificationItem,
  TerminalSession,
  GitCommitNode,
  GitRepo,
  ThemeMode,
} from "../types/workbench"
import {
  initialDiagnostics,
  initialFileBuffers,
  initialFiles,
  initialGitChanges,
  initialNotifications,
  initialTerminalLines,
  initialTerminalSessions,
  initialStagedChanges,
  initialGitCommits,
  initialGitRepos,
} from "../data/mockData"
import { CHAT_MODELS } from "../data/chatConstants"
import { detectLanguage, validateSyntax } from "../utils/linter"

interface WorkbenchContextType {
  // Layout toggles
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  togglePanel: () => void
  panelMaximized: boolean
  setPanelMaximized: (value: boolean | ((prev: boolean) => boolean)) => void
  togglePanelMaximized: () => void
  activeBottomTab: BottomTab
  setActiveBottomTab: (tab: BottomTab) => void
  bottomTabOrder: BottomTab[]
  reorderBottomTabs: (sourceIndex: number, targetIndex: number) => void
  chatOpen: boolean
  setChatOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleChat: () => void
  chatSessionsOpen: boolean
  setChatSessionsOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleChatSessions: () => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  settingsModalOpen: boolean
  setSettingsModalOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleSettingsModal: () => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void
  toggleTheme: () => void

  // Resizable Panel Dimensions
  sidebarWidth: number
  setSidebarWidth: (value: number | ((prev: number) => number)) => void
  resetSidebarWidth: () => void
  chatDrawerWidth: number
  setChatDrawerWidth: (value: number | ((prev: number) => number)) => void
  resetChatDrawerWidth: () => void
  bottomPanelHeight: number
  setBottomPanelHeight: (value: number | ((prev: number) => number)) => void
  resetBottomPanelHeight: () => void

  // Text Editor Settings
  minimapEnabled: boolean
  setMinimapEnabled: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleMinimap: () => void

  // Window Groups & Split Layout
  splitEditor: boolean
  setSplitEditor: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleSplitEditor: () => void
  closeSplitEditor: () => void
  splitRatio: number
  setSplitRatio: (ratio: number | ((prev: number) => number)) => void
  group1: EditorGroupState
  group2: EditorGroupState
  focusedGroup: "group1" | "group2"
  setFocusedGroup: (group: "group1" | "group2") => void
  openFileInGroup: (filename: string, group?: "group1" | "group2") => void
  closeTabInGroup: (group: "group1" | "group2", filename: string) => void
  setActiveTabInGroup: (group: "group1" | "group2", filename: string) => void
  moveTabBetweenGroups: (
    sourceGroup: "group1" | "group2",
    targetGroup: "group1" | "group2",
    filename: string,
    targetIndex?: number,
  ) => void
  reorderTabsInGroup: (
    group: "group1" | "group2",
    sourceIndex: number,
    targetIndex: number,
  ) => void

  // Backward-compatible helpers
  focusedPane: "primary" | "secondary"
  setFocusedPane: (pane: "primary" | "secondary") => void
  secondaryActiveTab: string
  setSecondaryActiveTab: (tab: string) => void
  openFileInPane: (filename: string, pane?: "primary" | "secondary") => void

  // Activity & Navigation
  activeActivity: ActivityType
  setActiveActivity: (activity: ActivityType) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  tabs: string[]
  closeTab: (tab: string) => void
  activeLanguage: string
  setActiveLanguage: (lang: string) => void

  // File Buffers, Linter & Cursor
  fileBuffers: Record<string, FileBuffer>
  updateFileContent: (filename: string, content: string) => void
  saveFile: (filename?: string) => void
  cursorPosition: CursorPosition
  setCursorPosition: (pos: CursorPosition) => void
  linterSettings: LinterSettings
  setLinterSettings: React.Dispatch<React.SetStateAction<LinterSettings>>
  navigateToDiagnostic: (diag: DiagnosticItem) => void

  // Workspace Data
  files: FileItem[]
  setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>
  createFile: (name: string, isFolder?: boolean, parentFolder?: string) => void
  renameFile: (oldName: string, newName: string) => void
  deleteFile: (name: string) => void
  diagnostics: DiagnosticItem[]
  notifications: NotificationItem[]
  markAllNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  activeBranch: string
  setActiveBranch: (branch: string) => void
  activeRepo: string
  setActiveRepo: (repo: string) => void
  gitRepos: GitRepo[]
  gitChanges: GitChange[]
  stagedChanges: GitChange[]
  gitCommits: GitCommitNode[]
  stageChange: (file: string) => void
  unstageChange: (file: string) => void
  stageAllChanges: () => void
  unstageAllChanges: () => void
  commitChanges: (message: string) => void
  gitPull: () => void
  gitPush: () => void

  // Terminal & Sessions
  terminalSessions: TerminalSession[]
  activeTerminalSessionId: string
  activeTerminalSession: TerminalSession | undefined
  setActiveTerminalSessionId: (id: string) => void
  createTerminalSession: (shellName?: string) => void
  closeTerminalSession: (id: string) => void
  terminalLines: string[]
  terminalRunning: boolean
  setTerminalRunning: (value: boolean | ((prev: boolean) => boolean)) => void
  sendTerminalCommand: (command: string, sessionId?: string) => void
  clearTerminal: (sessionId?: string) => void

  // Chat Sessions & Model Provider
  sessions: ChatSession[]
  activeSessionId: string
  activeSession: ChatSession
  activeProvider: ChatProvider
  activeModel: string
  createSession: (provider?: ChatProvider, model?: string) => string
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  setSessionModel: (provider: ChatProvider, model: string) => void
  chatMessages: ChatMessage[]
  sendChatMessage: (text: string) => void

  // Toast & Global Actions
  toast: string
  showToast: (message: string) => void
  clearToast: () => void
  runAction: (action: string) => void
}

const WorkbenchContext = createContext<WorkbenchContextType | null>(null)

const DEFAULT_PROVIDER: ChatProvider = "antigravity"
const DEFAULT_MODEL = "gemini-2.5-flash"

function createDefaultSession(id = "session-1"): ChatSession {
  return {
    id,
    title: "New Session",
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    messages: [
      {
        id: "msg-1",
        role: "agent",
        text: "I'm connected to your local workspace. What should we build next?",
      },
    ],
    createdAt: Date.now(),
  }
}

function loadStoredSessions(): ChatSession[] {
  if (typeof window === "undefined") return [createDefaultSession()]
  try {
    const raw = window.localStorage.getItem("aegis_chat_sessions_v2")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // fallback
  }
  return [createDefaultSession()]
}

function loadStoredActiveId(sessions: ChatSession[]): string {
  if (typeof window === "undefined") return sessions[0]?.id || "session-1"
  try {
    const raw = window.localStorage.getItem("aegis_active_session_id_v2")
    if (raw && sessions.some((s) => s.id === raw)) {
      return raw
    }
  } catch {
    // fallback
  }
  return sessions[0]?.id || "session-1"
}

const DEFAULT_BOTTOM_TAB_ORDER: BottomTab[] = ["Terminal", "Problems", "Output"]

function loadStoredBottomTabOrder(): BottomTab[] {
  if (typeof window === "undefined") return DEFAULT_BOTTOM_TAB_ORDER
  try {
    const raw = window.localStorage.getItem("aegis_bottom_panel_tab_order")
    if (raw) {
      const parsed = JSON.parse(raw) as BottomTab[]
      if (
        Array.isArray(parsed) &&
        parsed.length === 3 &&
        parsed.includes("Terminal") &&
        parsed.includes("Problems") &&
        parsed.includes("Output")
      ) {
        return parsed
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_BOTTOM_TAB_ORDER
}

function loadStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark"
  try {
    const stored = window.localStorage.getItem("aegis_theme")
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // fallback
  }
  return "dark"
}

const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 160
const MAX_SIDEBAR_WIDTH = 460

const DEFAULT_CHAT_WIDTH = 300
const MIN_CHAT_WIDTH = 260
const MAX_CHAT_WIDTH = 600

const DEFAULT_BOTTOM_HEIGHT = 180
const MIN_BOTTOM_HEIGHT = 100

function loadStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const val = parseInt(raw, 10)
      if (!isNaN(val) && val >= min && val <= max) {
        return val
      }
    }
  } catch {
    // fallback
  }
  return fallback
}

function generateContextualReply(
  text: string,
  provider: ChatProvider,
  model: string,
): string {
  const skillMatch = text.match(/^\/(spec|plan|review|debug|simplify)\b/i)
  const mentions = Array.from(text.matchAll(/@([a-zA-Z0-9_\-./]+)/g)).map(
    (m) => m[0],
  )
  const contextNote =
    mentions.length > 0 ? `\n• Context: ${mentions.join(", ")}` : ""

  if (skillMatch) {
    const cmd = skillMatch[1].toLowerCase()
    switch (cmd) {
      case "spec":
        return `[${provider} · ${model}] Specification Draft generated:\n• Architectural scope and acceptance criteria established.\n• Microservice boundaries verified.${contextNote}`
      case "plan":
        return `[${provider} · ${model}] Implementation Plan generated:\n1. Audit relevant modules & dependencies\n2. Incremental implementation with verifiable gates\n3. Integration tests and validation${contextNote}`
      case "review":
        return `[${provider} · ${model}] Code Review Audit complete:\n• Verified clean structure and 0 lint violations.\n• Styling tokens and component designs properly reused.${contextNote}`
      case "debug":
        return `[${provider} · ${model}] Diagnostic Analysis complete:\n• Root cause investigated for workspace telemetry.\n• Verified zero runtime regressions.${contextNote}`
      case "simplify":
        return `[${provider} · ${model}] Simplification Analysis complete:\n• Identified opportunities to eliminate unnecessary code.\n• Lightweight design patterns applied.${contextNote}`
    }
  }

  if (mentions.length > 0) {
    return `[${provider} · ${model}] Inspected context for ${mentions.join(", ")}. Ready to proceed with implementation or answer questions.`
  }

  return `[${provider} · ${model}] Received: "${
    text.length > 40 ? text.slice(0, 40) + "..." : text
  }". Workspace context is ready.`
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelMaximized, setPanelMaximized] = useState(false)
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("Terminal")
  const [bottomTabOrder, setBottomTabOrder] = useState<BottomTab[]>(
    loadStoredBottomTabOrder,
  )
  const [chatOpen, setChatOpen] = useState(true)
  const [chatSessionsOpen, setChatSessionsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const toggleSettingsModal = useCallback(() => {
    setSettingsModalOpen((prev) => !prev)
  }, [])

  const [theme, setThemeState] = useState<ThemeMode>(loadStoredTheme)

  const setTheme = useCallback(
    (value: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => {
      setThemeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        try {
          window.localStorage.setItem("aegis_theme", next)
        } catch {
          // ignore storage error
        }
        return next
      })
    },
    [],
  )

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }, [setTheme])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  // Resizable Panel Dimensions
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() =>
    loadStoredNumber(
      "aegis_sidebar_width",
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
  )
  const [chatDrawerWidth, setChatDrawerWidthState] = useState<number>(() =>
    loadStoredNumber(
      "aegis_chat_width",
      DEFAULT_CHAT_WIDTH,
      MIN_CHAT_WIDTH,
      MAX_CHAT_WIDTH,
    ),
  )
  const [bottomPanelHeight, setBottomPanelHeightState] = useState<number>(() =>
    loadStoredNumber(
      "aegis_bottom_height",
      DEFAULT_BOTTOM_HEIGHT,
      MIN_BOTTOM_HEIGHT,
      800,
    ),
  )

  const [lastSidebarWidth, setLastSidebarWidth] = useState<number>(
    () => sidebarWidth,
  )
  const [lastChatWidth, setLastChatWidth] = useState<number>(
    () => chatDrawerWidth,
  )
  const [lastBottomHeight, setLastBottomHeight] = useState<number>(
    () => bottomPanelHeight,
  )

  const setSidebarWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setSidebarWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_SIDEBAR_WIDTH) {
          setLastSidebarWidth(next)
          try {
            window.localStorage.setItem("aegis_sidebar_width", String(next))
          } catch {
            // ignore
          }
        }
        return next
      })
    },
    [],
  )

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidthState(DEFAULT_SIDEBAR_WIDTH)
    setLastSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    try {
      window.localStorage.setItem(
        "aegis_sidebar_width",
        String(DEFAULT_SIDEBAR_WIDTH),
      )
    } catch {
      // ignore
    }
  }, [])

  const setChatDrawerWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setChatDrawerWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_CHAT_WIDTH) {
          setLastChatWidth(next)
          try {
            window.localStorage.setItem("aegis_chat_width", String(next))
          } catch {
            // ignore
          }
        }
        return next
      })
    },
    [],
  )

  const resetChatDrawerWidth = useCallback(() => {
    setChatDrawerWidthState(DEFAULT_CHAT_WIDTH)
    setLastChatWidth(DEFAULT_CHAT_WIDTH)
    try {
      window.localStorage.setItem(
        "aegis_chat_width",
        String(DEFAULT_CHAT_WIDTH),
      )
    } catch {
      // ignore
    }
  }, [])

  const setBottomPanelHeight = useCallback(
    (value: number | ((prev: number) => number)) => {
      setBottomPanelHeightState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_BOTTOM_HEIGHT) {
          setLastBottomHeight(next)
          try {
            window.localStorage.setItem("aegis_bottom_height", String(next))
          } catch {
            // ignore
          }
        }
        return next
      })
    },
    [],
  )

  const resetBottomPanelHeight = useCallback(() => {
    setBottomPanelHeightState(DEFAULT_BOTTOM_HEIGHT)
    setLastBottomHeight(DEFAULT_BOTTOM_HEIGHT)
    try {
      window.localStorage.setItem(
        "aegis_bottom_height",
        String(DEFAULT_BOTTOM_HEIGHT),
      )
    } catch {
      // ignore
    }
  }, [])

  const [minimapEnabled, setMinimapEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    try {
      const stored = window.localStorage.getItem("aegis_minimap_enabled")
      if (stored !== null) return stored === "true"
    } catch {
      // ignore
    }
    return true
  })

  const setMinimapEnabled = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setMinimapEnabledState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        try {
          window.localStorage.setItem("aegis_minimap_enabled", String(next))
        } catch {
          // ignore
        }
        return next
      })
    },
    [],
  )

  const toggleMinimap = useCallback(() => {
    setMinimapEnabled((v) => !v)
  }, [setMinimapEnabled])

  const [splitEditor, setSplitEditor] = useState(false)
  const [splitRatio, setSplitRatio] = useState(50)
  const [focusedGroup, setFocusedGroup] = useState<"group1" | "group2">(
    "group1",
  )

  const [group1, setGroup1] = useState<EditorGroupState>({
    id: "group1",
    name: "Group 1",
    tabs: ["App.tsx", "Status.tsx"],
    activeTab: "App.tsx",
  })

  const [group2, setGroup2] = useState<EditorGroupState>({
    id: "group2",
    name: "Group 2",
    tabs: ["package.json"],
    activeTab: "package.json",
  })

  // Activity & Editor states
  const [activeActivity, setActiveActivity] = useState<ActivityType>("Explorer")
  const [activeLanguage, setActiveLanguage] = useState("TypeScript")

  // File Buffers, Cursor & Linter states
  const [fileBuffers, setFileBuffers] =
    useState<Record<string, FileBuffer>>(initialFileBuffers)
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 1,
    col: 1,
  })
  const [linterSettings, setLinterSettings] = useState<LinterSettings>({
    enabled: true,
    trigger: "onType",
    showWarnings: true,
  })

  // Data states
  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const [diagnostics, setDiagnostics] =
    useState<DiagnosticItem[]>(initialDiagnostics)
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications)
  const [activeBranch, setActiveBranch] = useState("main")
  const [activeRepo, setActiveRepo] = useState("aegis-code-v2")
  const [gitRepos, setGitRepos] = useState<GitRepo[]>(initialGitRepos)
  const [gitChanges, setGitChanges] = useState<GitChange[]>(initialGitChanges)
  const [stagedChanges, setStagedChanges] =
    useState<GitChange[]>(initialStagedChanges)
  const [gitCommits, setGitCommits] =
    useState<GitCommitNode[]>(initialGitCommits)

  // Terminal state
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(
    () => initialTerminalSessions,
  )
  const [activeTerminalSessionId, setActiveTerminalSessionId] =
    useState<string>(() => initialTerminalSessions[0]?.id || "session-term-1")

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "aegis_bottom_panel_tab_order",
        JSON.stringify(bottomTabOrder),
      )
    } catch {
      // storage unavailable
    }
  }, [bottomTabOrder])

  const togglePanelMaximized = useCallback(() => {
    setPanelMaximized((prev) => !prev)
  }, [])

  const reorderBottomTabs = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      setBottomTabOrder((prev) => {
        if (
          sourceIndex < 0 ||
          sourceIndex >= prev.length ||
          targetIndex < 0 ||
          targetIndex >= prev.length ||
          sourceIndex === targetIndex
        ) {
          return prev
        }
        const next = [...prev]
        const [moved] = next.splice(sourceIndex, 1)
        next.splice(targetIndex, 0, moved)
        return next
      })
    },
    [],
  )

  // Chat sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(loadStoredSessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    loadStoredActiveId(sessions),
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "aegis_chat_sessions_v2",
        JSON.stringify(sessions),
      )
    } catch {
      // storage unavailable
    }
  }, [sessions])

  useEffect(() => {
    try {
      window.localStorage.setItem("aegis_active_session_id_v2", activeSessionId)
    } catch {
      // storage unavailable
    }
  }, [activeSessionId])

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ||
    sessions[0] ||
    createDefaultSession()
  const activeProvider = activeSession.provider
  const activeModel = activeSession.model
  const chatMessages = activeSession.messages

  const createSession = useCallback(
    (provider?: ChatProvider, model?: string) => {
      const newId = `session-${Date.now()}`
      const p = provider || DEFAULT_PROVIDER
      const m = model || CHAT_MODELS[p]?.[0]?.id || DEFAULT_MODEL
      const newSession: ChatSession = {
        id: newId,
        title: "New Session",
        provider: p,
        model: m,
        messages: [
          {
            id: `msg-${Date.now()}`,
            role: "agent",
            text: `[${p} · ${m}] New session started. Ready to assist with your codebase.`,
          },
        ],
        createdAt: Date.now(),
      }
      setSessions((prev) => [newSession, ...prev])
      setActiveSessionId(newId)
      return newId
    },
    [],
  )

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id)
        if (remaining.length === 0) {
          const fresh = createDefaultSession(`session-${Date.now()}`)
          setActiveSessionId(fresh.id)
          return [fresh]
        }
        if (activeSessionId === id) {
          setActiveSessionId(remaining[0].id)
        }
        return remaining
      })
    },
    [activeSessionId],
  )

  const setSessionModel = useCallback(
    (provider: ChatProvider, model: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSessionId) {
            return { ...s, provider, model }
          }
          return s
        }),
      )
    },
    [activeSessionId],
  )

  // Toast state
  const [toast, setToast] = useState("")

  // Computed compatibility values
  const currentFocusedFile =
    focusedGroup === "group2" && splitEditor
      ? group2.activeTab
      : group1.activeTab
  const activeTab = currentFocusedFile
  const secondaryActiveTab = group2.activeTab
  const tabs = Array.from(new Set([...group1.tabs, ...group2.tabs]))
  const focusedPane = focusedGroup === "group2" ? "secondary" : "primary"

  const setFocusedPane = useCallback(
    (pane: "primary" | "secondary") =>
      setFocusedGroup(pane === "secondary" ? "group2" : "group1"),
    [],
  )

  // Auto-detect language dynamically from focused file
  useEffect(() => {
    if (currentFocusedFile) {
      setActiveLanguage(detectLanguage(currentFocusedFile))
    }
  }, [currentFocusedFile])

  // Reactive auto-linting on type
  useEffect(() => {
    if (!linterSettings.enabled || linterSettings.trigger !== "onType") {
      if (!linterSettings.enabled) {
        setDiagnostics([])
      }
      return
    }

    const timer = setTimeout(() => {
      if (currentFocusedFile) {
        const buffer = fileBuffers[currentFocusedFile]
        if (buffer) {
          const fileDiags = validateSyntax(
            currentFocusedFile,
            buffer.content,
            linterSettings.showWarnings,
          )
          setDiagnostics((prev) => [
            ...prev.filter((d) => !d.location.startsWith(currentFocusedFile)),
            ...fileDiags,
          ])
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [currentFocusedFile, fileBuffers, linterSettings])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev
      if (next && sidebarWidth < MIN_SIDEBAR_WIDTH) {
        setSidebarWidthState(
          lastSidebarWidth >= MIN_SIDEBAR_WIDTH
            ? lastSidebarWidth
            : DEFAULT_SIDEBAR_WIDTH,
        )
      }
      return next
    })
  }, [lastSidebarWidth, sidebarWidth])

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => {
      const next = !prev
      if (next && bottomPanelHeight < MIN_BOTTOM_HEIGHT) {
        setBottomPanelHeightState(
          lastBottomHeight >= MIN_BOTTOM_HEIGHT
            ? lastBottomHeight
            : DEFAULT_BOTTOM_HEIGHT,
        )
      }
      return next
    })
  }, [bottomPanelHeight, lastBottomHeight])

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => {
      const next = !prev
      if (next && chatDrawerWidth < MIN_CHAT_WIDTH) {
        setChatDrawerWidthState(
          lastChatWidth >= MIN_CHAT_WIDTH ? lastChatWidth : DEFAULT_CHAT_WIDTH,
        )
      }
      return next
    })
  }, [chatDrawerWidth, lastChatWidth])

  // Desktop Responsive Viewport Observer
  useEffect(() => {
    if (typeof window === "undefined") return

    function handleResize() {
      const winWidth = window.innerWidth
      if (winWidth < 980) {
        if (chatOpen) setChatOpen(false)
        if (sidebarOpen && winWidth < 768) setSidebarOpen(false)
      } else if (winWidth < 1200) {
        const currentSidebar = sidebarOpen ? sidebarWidth : 0
        const currentChat = chatOpen ? chatDrawerWidth : 0
        const availableForEditor = winWidth - 44 - currentSidebar - currentChat
        if (availableForEditor < 320 && chatOpen) {
          const maxChatPossible = winWidth - 44 - currentSidebar - 320
          if (maxChatPossible < MIN_CHAT_WIDTH) {
            setChatOpen(false)
          } else {
            setChatDrawerWidthState(Math.floor(maxChatPossible))
          }
        }
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [chatOpen, sidebarOpen, sidebarWidth, chatDrawerWidth])

  const toggleChatSessions = useCallback(
    () => setChatSessionsOpen((v) => !v),
    [],
  )

  const openFileInGroup = useCallback(
    (filename: string, group?: "group1" | "group2") => {
      const targetGroup = group || focusedGroup
      if (targetGroup === "group2") {
        setGroup2((prev) => ({
          ...prev,
          tabs: prev.tabs.includes(filename)
            ? prev.tabs
            : [...prev.tabs, filename],
          activeTab: filename,
        }))
        setSplitEditor(true)
        setFocusedGroup("group2")
      } else {
        setGroup1((prev) => ({
          ...prev,
          tabs: prev.tabs.includes(filename)
            ? prev.tabs
            : [...prev.tabs, filename],
          activeTab: filename,
        }))
        setFocusedGroup("group1")
      }
    },
    [focusedGroup],
  )

  const setActiveTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      if (group === "group2") {
        setGroup2((prev) => ({ ...prev, activeTab: filename }))
        setFocusedGroup("group2")
      } else {
        setGroup1((prev) => ({ ...prev, activeTab: filename }))
        setFocusedGroup("group1")
      }
    },
    [],
  )

  const setSecondaryActiveTab = useCallback(
    (tab: string) => {
      setActiveTabInGroup("group2", tab)
    },
    [setActiveTabInGroup],
  )

  const closeTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      if (group === "group2") {
        setGroup2((prev) => {
          const nextTabs = prev.tabs.filter((t) => t !== filename)
          if (nextTabs.length === 0) {
            setSplitEditor(false)
            setFocusedGroup("group1")
            return {
              ...prev,
              tabs: [],
              activeTab: "",
            }
          }
          const nextActive =
            prev.activeTab === filename ? nextTabs[0] : prev.activeTab
          return {
            ...prev,
            tabs: nextTabs,
            activeTab: nextActive,
          }
        })
      } else {
        setGroup1((prev) => {
          const nextTabs = prev.tabs.filter((t) => t !== filename)
          const nextActive =
            prev.activeTab === filename ? nextTabs[0] || "" : prev.activeTab
          return {
            ...prev,
            tabs: nextTabs,
            activeTab: nextActive,
          }
        })
      }
    },
    [],
  )

  const moveTabBetweenGroups = useCallback(
    (
      sourceGroup: "group1" | "group2",
      targetGroup: "group1" | "group2",
      filename: string,
      targetIndex?: number,
    ) => {
      if (sourceGroup === targetGroup) {
        return
      }

      // Remove from source
      if (sourceGroup === "group1") {
        setGroup1((prev) => {
          const filtered = prev.tabs.filter((t) => t !== filename)
          return {
            ...prev,
            tabs: filtered,
            activeTab:
              prev.activeTab === filename ? filtered[0] || "" : prev.activeTab,
          }
        })
      } else {
        setGroup2((prev) => {
          const filtered = prev.tabs.filter((t) => t !== filename)
          if (filtered.length === 0) {
            setSplitEditor(false)
            setFocusedGroup("group1")
          }
          return {
            ...prev,
            tabs: filtered,
            activeTab:
              prev.activeTab === filename ? filtered[0] || "" : prev.activeTab,
          }
        })
      }

      // Add to target
      if (targetGroup === "group2") {
        setGroup2((prev) => {
          const newTabs = [...prev.tabs]
          if (
            typeof targetIndex === "number" &&
            targetIndex >= 0 &&
            targetIndex <= newTabs.length
          ) {
            newTabs.splice(targetIndex, 0, filename)
          } else if (!newTabs.includes(filename)) {
            newTabs.push(filename)
          }
          return {
            ...prev,
            tabs: newTabs,
            activeTab: filename,
          }
        })
        setSplitEditor(true)
        setFocusedGroup("group2")
      } else {
        setGroup1((prev) => {
          const newTabs = [...prev.tabs]
          if (
            typeof targetIndex === "number" &&
            targetIndex >= 0 &&
            targetIndex <= newTabs.length
          ) {
            newTabs.splice(targetIndex, 0, filename)
          } else if (!newTabs.includes(filename)) {
            newTabs.push(filename)
          }
          return {
            ...prev,
            tabs: newTabs,
            activeTab: filename,
          }
        })
        setFocusedGroup("group1")
      }
    },
    [],
  )

  const reorderTabsInGroup = useCallback(
    (group: "group1" | "group2", sourceIndex: number, targetIndex: number) => {
      const setter = group === "group1" ? setGroup1 : setGroup2
      setter((prev) => {
        if (
          sourceIndex < 0 ||
          sourceIndex >= prev.tabs.length ||
          targetIndex < 0 ||
          targetIndex >= prev.tabs.length ||
          sourceIndex === targetIndex
        ) {
          return prev
        }
        const newTabs = [...prev.tabs]
        const [moved] = newTabs.splice(sourceIndex, 1)
        newTabs.splice(targetIndex, 0, moved)
        return {
          ...prev,
          tabs: newTabs,
        }
      })
    },
    [],
  )

  const toggleSplitEditor = useCallback(() => {
    setSplitEditor((prev) => {
      if (prev) {
        setFocusedGroup("group1")
        return false
      }
      setGroup2((prevG2) => {
        if (prevG2.tabs.length > 0) return prevG2
        const candidate =
          group1.tabs.find((t) => t !== group1.activeTab) ||
          group1.activeTab ||
          "package.json"
        return {
          ...prevG2,
          tabs: [candidate],
          activeTab: candidate,
        }
      })
      setFocusedGroup("group2")
      return true
    })
  }, [group1])

  const closeSplitEditor = useCallback(() => {
    setSplitEditor(false)
    setFocusedGroup("group1")
  }, [])

  const openFileInPane = useCallback(
    (filename: string, pane?: "primary" | "secondary") => {
      openFileInGroup(filename, pane === "secondary" ? "group2" : "group1")
    },
    [openFileInGroup],
  )

  const setActiveTab = useCallback(
    (tab: string) => {
      openFileInGroup(tab, focusedGroup)
    },
    [focusedGroup, openFileInGroup],
  )

  const closeTab = useCallback(
    (tabToClose: string) => {
      closeTabInGroup(focusedGroup, tabToClose)
    },
    [closeTabInGroup, focusedGroup],
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 2200)
  }, [])

  const updateFileContent = useCallback((filename: string, content: string) => {
    setFileBuffers((prev) => {
      const existing = prev[filename]
      return {
        ...prev,
        [filename]: {
          content,
          isDirty: true,
          language: existing?.language || detectLanguage(filename),
        },
      }
    })
  }, [])

  const saveFile = useCallback(
    (filenameToSave?: string) => {
      const target =
        filenameToSave ||
        (focusedPane === "secondary" && splitEditor
          ? secondaryActiveTab
          : activeTab)

      setFileBuffers((prev) => {
        const buf = prev[target]
        if (!buf) return prev
        return {
          ...prev,
          [target]: {
            ...buf,
            isDirty: false,
          },
        }
      })

      if (linterSettings.enabled) {
        const buf = fileBuffers[target]
        if (buf) {
          const fileDiags = validateSyntax(
            target,
            buf.content,
            linterSettings.showWarnings,
          )
          setDiagnostics((prev) => [
            ...prev.filter((d) => !d.location.startsWith(target)),
            ...fileDiags,
          ])
        }
      }

      showToast(`Saved ${target}`)
    },
    [
      activeTab,
      fileBuffers,
      focusedPane,
      linterSettings,
      secondaryActiveTab,
      showToast,
      splitEditor,
    ],
  )

  const navigateToDiagnostic = useCallback(
    (diag: DiagnosticItem) => {
      const match = diag.location.match(/^([^[\s]+)\s*\[(\d+),\s*(\d+)\]/)
      if (match) {
        const filename = match[1]
        const line = parseInt(match[2], 10)
        const col = parseInt(match[3], 10)

        openFileInPane(filename)
        setCursorPosition({ line, col })
        showToast(`Jumped to ${filename} [Ln ${line}, Col ${col}]`)
      } else {
        showToast(`Navigating to ${diag.location}`)
      }
    },
    [openFileInPane, showToast],
  )

  const clearToast = useCallback(() => setToast(""), [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
  }, [])

  const createFile = useCallback(
    (name: string, isFolder = false, parentFolder?: string) => {
      const cleanName = name.trim()
      if (!cleanName) return

      const newPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName
      const newItem: FileItem = {
        name: cleanName,
        type: isFolder ? "folder" : "file",
        path: newPath,
        modified: true,
        children: isFolder ? [] : undefined,
      }

      setFiles((prevFiles) => {
        if (!parentFolder) {
          return [...prevFiles, newItem]
        }
        const addRecursive = (items: FileItem[]): FileItem[] => {
          return items.map((item) => {
            if (
              item.type === "folder" &&
              (item.path === parentFolder || item.name === parentFolder)
            ) {
              return {
                ...item,
                children: [...(item.children || []), newItem],
              }
            }
            if (item.children) {
              return {
                ...item,
                children: addRecursive(item.children),
              }
            }
            return item
          })
        }
        return addRecursive(prevFiles)
      })

      if (!isFolder) {
        setFileBuffers((prev) => ({
          ...prev,
          [cleanName]: {
            content: `// ${cleanName}\n`,
            isDirty: true,
            language: detectLanguage(cleanName),
          },
        }))
        setGitChanges((prev) => [
          ...prev,
          { file: cleanName, status: "added", additions: 1, deletions: 0 },
        ])
        showToast(`Created file: ${cleanName}`)
      } else {
        showToast(`Created folder: ${cleanName}`)
      }
    },
    [showToast],
  )

  const renameFile = useCallback(
    (oldName: string, newName: string) => {
      const clean = newName.trim()
      if (!clean || clean === oldName) return

      const updateRecursive = (items: FileItem[]): FileItem[] => {
        return items.map((item) => {
          if (item.name === oldName) {
            return {
              ...item,
              name: clean,
              path: item.path
                ? item.path.replace(new RegExp(`${oldName}$`), clean)
                : clean,
              modified: true,
            }
          }
          if (item.children) {
            return { ...item, children: updateRecursive(item.children) }
          }
          return item
        })
      }

      setFiles((prev) => updateRecursive(prev))

      setFileBuffers((prev) => {
        if (prev[oldName]) {
          const buffer = prev[oldName]
          const next = { ...prev }
          delete next[oldName]
          next[clean] = {
            ...buffer,
            isDirty: true,
            language: detectLanguage(clean),
          }
          return next
        }
        return prev
      })

      setGroup1((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t === oldName ? clean : t)),
        activeTab: prev.activeTab === oldName ? clean : prev.activeTab,
      }))
      setGroup2((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t === oldName ? clean : t)),
        activeTab: prev.activeTab === oldName ? clean : prev.activeTab,
      }))

      showToast(`Renamed ${oldName} to ${clean}`)
    },
    [showToast],
  )

  const deleteFile = useCallback(
    (name: string) => {
      const deleteRecursive = (items: FileItem[]): FileItem[] => {
        return items
          .filter((item) => item.name !== name && item.path !== name)
          .map((item) => {
            if (item.children) {
              return { ...item, children: deleteRecursive(item.children) }
            }
            return item
          })
      }

      setFiles((prev) => deleteRecursive(prev))
      setFileBuffers((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })

      closeTabInGroup("group1", name)
      closeTabInGroup("group2", name)

      setGitChanges((prev) => [
        ...prev.filter((c) => c.file !== name),
        { file: name, status: "deleted", additions: 0, deletions: 1 },
      ])
      setStagedChanges((prev) => prev.filter((c) => c.file !== name))

      showToast(`Deleted ${name}`)
    },
    [closeTabInGroup, showToast],
  )

  const stageChange = useCallback((file: string) => {
    setGitChanges((prevChanges) => {
      const target = prevChanges.find((c) => c.file === file)
      if (!target) return prevChanges
      setStagedChanges((prevStaged) => {
        if (prevStaged.some((s) => s.file === file)) return prevStaged
        return [...prevStaged, target]
      })
      return prevChanges.filter((c) => c.file !== file)
    })
  }, [])

  const unstageChange = useCallback((file: string) => {
    setStagedChanges((prevStaged) => {
      const target = prevStaged.find((s) => s.file === file)
      if (!target) return prevStaged
      setGitChanges((prevChanges) => {
        if (prevChanges.some((c) => c.file === file)) return prevChanges
        return [...prevChanges, target]
      })
      return prevStaged.filter((s) => s.file !== file)
    })
  }, [])

  const stageAllChanges = useCallback(() => {
    setGitChanges((prevChanges) => {
      setStagedChanges((prevStaged) => [...prevStaged, ...prevChanges])
      return []
    })
    showToast("Staged all changes")
  }, [showToast])

  const unstageAllChanges = useCallback(() => {
    setStagedChanges((prevStaged) => {
      setGitChanges((prevChanges) => [...prevChanges, ...prevStaged])
      return []
    })
    showToast("Unstaged all changes")
  }, [showToast])

  const commitChanges = useCallback(
    (message: string) => {
      const cleanMsg = message.trim()
      if (!cleanMsg) {
        showToast("Please enter a commit message")
        return
      }
      if (stagedChanges.length === 0) {
        showToast("No staged changes to commit")
        return
      }
      const newCommit: GitCommitNode = {
        hash: Math.random().toString(16).substring(2, 9),
        message: cleanMsg,
        author: "Adit Wicaksono",
        timestamp: "Just now",
        branch: activeBranch,
      }
      setGitCommits((prev) => [newCommit, ...prev])
      setStagedChanges([])
      showToast(`Committed [${newCommit.hash}]: ${cleanMsg}`)
    },
    [activeBranch, showToast, stagedChanges],
  )

  const gitPull = useCallback(() => {
    showToast(`Pulled latest changes from origin/${activeBranch}`)
  }, [activeBranch, showToast])

  const gitPush = useCallback(() => {
    showToast(`Pushed commits to origin/${activeBranch}`)
  }, [activeBranch, showToast])

  const activeTerminalSession =
    terminalSessions.find((s) => s.id === activeTerminalSessionId) ||
    terminalSessions[0]
  const terminalLines = activeTerminalSession?.lines || []
  const terminalRunning = activeTerminalSession?.running ?? false

  const setTerminalRunning = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setTerminalSessions((sessions) =>
        sessions.map((s) => {
          if (s.id !== activeTerminalSessionId) return s
          const nextRunning =
            typeof value === "function" ? value(s.running) : value
          return { ...s, running: nextRunning }
        }),
      )
    },
    [activeTerminalSessionId],
  )

  const createTerminalSession = useCallback((shellName = "zsh") => {
    setTerminalSessions((sessions) => {
      const nextNum = sessions.length + 1
      const newSession: TerminalSession = {
        id: `session-term-${Date.now()}`,
        name: `${nextNum}: ${shellName}`,
        shell: shellName,
        lines: [
          `➜ New terminal session started (${shellName})`,
          `SSE connected · session local-${String(nextNum).padStart(2, "0")}`,
        ],
        running: true,
        commandHistory: [],
      }
      setActiveTerminalSessionId(newSession.id)
      return [...sessions, newSession]
    })
  }, [])

  const closeTerminalSession = useCallback((idToClose: string) => {
    setTerminalSessions((sessions) => {
      if (sessions.length <= 1) {
        return [
          {
            id: `session-term-${Date.now()}`,
            name: "1: zsh",
            shell: "zsh",
            lines: ["Terminal reset"],
            running: true,
            commandHistory: [],
          },
        ]
      }
      const nextSessions = sessions.filter((s) => s.id !== idToClose)
      setActiveTerminalSessionId((currId) => {
        if (currId === idToClose) {
          return nextSessions[0]?.id || ""
        }
        return currId
      })
      return nextSessions
    })
  }, [])

  const clearTerminal = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId || activeTerminalSessionId
      setTerminalSessions((sessions) =>
        sessions.map((s) => (s.id === targetId ? { ...s, lines: [] } : s)),
      )
    },
    [activeTerminalSessionId],
  )

  const sendTerminalCommand = useCallback(
    (commandText: string, sessionId?: string) => {
      const value = commandText.trim()
      if (!value) return
      const targetId = sessionId || activeTerminalSessionId

      setTerminalSessions((sessions) =>
        sessions.map((s) => {
          if (s.id !== targetId) return s

          const nextHistory = [...s.commandHistory]
          if (nextHistory[nextHistory.length - 1] !== value) {
            nextHistory.push(value)
          }

          if (value === "clear") {
            return { ...s, lines: [], commandHistory: nextHistory }
          }

          let extraLines: string[] = []
          if (value === "lint") {
            extraLines = [
              `$ ${value}`,
              "Lint complete · 1 error, 1 warning · 42 ms",
            ]
          } else if (value.startsWith("echo ")) {
            extraLines = [`$ ${value}`, value.slice(5)]
          } else if (value === "pwd") {
            extraLines = [
              `$ ${value}`,
              "/Users/aditwicaksono/Documents/Project-AI/AegisCodev2",
            ]
          } else if (value === "ls") {
            extraLines = [
              `$ ${value}`,
              "src  public  package.json  vite.config.ts  README.md",
            ]
          } else {
            extraLines = [`$ ${value}`, `command queued locally: ${value}`]
          }

          return {
            ...s,
            lines: [...s.lines, ...extraLines],
            commandHistory: nextHistory,
          }
        }),
      )
    },
    [activeTerminalSessionId],
  )

  const sendChatMessage = useCallback(
    (text: string) => {
      const cleanText = text.trim()
      if (!cleanText) return

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        text: cleanText,
      }

      setSessions((prevSessions) => {
        return prevSessions.map((s) => {
          if (s.id !== activeSessionId) return s

          const newMessages = [...s.messages, userMsg]
          const newTitle =
            s.title === "New Session"
              ? cleanText.slice(0, 26).trim() +
                (cleanText.length > 26 ? "..." : "")
              : s.title

          const agentReplyText = generateContextualReply(
            cleanText,
            s.provider,
            s.model,
          )
          const agentMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            role: "agent",
            text: agentReplyText,
          }

          return {
            ...s,
            title: newTitle,
            messages: [...newMessages, agentMsg],
          }
        })
      })
    },
    [activeSessionId],
  )

  const runAction = useCallback(
    (action: string) => {
      const actionMessages: Record<string, string> = {
        "clear-terminal": "Terminal output cleared",
        find: `Find widget opened for ${activeTab}`,
        "new-file": "Untitled-1 created",
        "open-folder": "Folder picker ready",
        redo: "Nothing to redo",
        run: "Run session queued without debugging",
        "run-file": `Running ${activeTab}`,
        stop: "Active run session stopped",
        undo: "Last editor action reverted",
      }

      if (action === "commands") {
        setCommandPaletteOpen(true)
      } else if (action === "sidebar") {
        toggleSidebar()
      } else if (action === "panel" || action === "new-terminal") {
        togglePanel()
      } else if (action === "save") {
        saveFile()
      } else {
        showToast(actionMessages[action] ?? "Command completed")
      }
    },
    [activeTab, saveFile, showToast, togglePanel, toggleSidebar],
  )

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        toggleSidebar()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        togglePanel()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        saveFile()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        toggleSettingsModal()
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false)
        setSettingsModalOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveFile, togglePanel, toggleSidebar, toggleSettingsModal])

  return (
    <WorkbenchContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        panelOpen,
        setPanelOpen,
        togglePanel,
        panelMaximized,
        setPanelMaximized,
        togglePanelMaximized,
        activeBottomTab,
        setActiveBottomTab,
        bottomTabOrder,
        reorderBottomTabs,
        chatOpen,
        setChatOpen,
        toggleChat,
        chatSessionsOpen,
        setChatSessionsOpen,
        toggleChatSessions,
        commandPaletteOpen,
        setCommandPaletteOpen,
        settingsModalOpen,
        setSettingsModalOpen,
        toggleSettingsModal,
        theme,
        setTheme,
        toggleTheme,
        sidebarWidth,
        setSidebarWidth,
        resetSidebarWidth,
        chatDrawerWidth,
        setChatDrawerWidth,
        resetChatDrawerWidth,
        bottomPanelHeight,
        setBottomPanelHeight,
        resetBottomPanelHeight,
        minimapEnabled,
        setMinimapEnabled,
        toggleMinimap,
        splitEditor,
        setSplitEditor,
        toggleSplitEditor,
        closeSplitEditor,
        splitRatio,
        setSplitRatio,
        group1,
        group2,
        focusedGroup,
        setFocusedGroup,
        openFileInGroup,
        closeTabInGroup,
        setActiveTabInGroup,
        moveTabBetweenGroups,
        reorderTabsInGroup,
        focusedPane,
        setFocusedPane,
        secondaryActiveTab,
        setSecondaryActiveTab,
        openFileInPane,
        activeActivity,
        setActiveActivity,
        activeTab,
        setActiveTab,
        tabs,
        closeTab,
        activeLanguage,
        setActiveLanguage,
        fileBuffers,
        updateFileContent,
        saveFile,
        cursorPosition,
        setCursorPosition,
        linterSettings,
        setLinterSettings,
        navigateToDiagnostic,
        files,
        setFiles,
        createFile,
        renameFile,
        deleteFile,
        diagnostics,
        notifications,
        markAllNotificationsRead,
        markNotificationRead,
        activeBranch,
        setActiveBranch,
        activeRepo,
        setActiveRepo,
        gitRepos,
        gitChanges,
        stagedChanges,
        gitCommits,
        stageChange,
        unstageChange,
        stageAllChanges,
        unstageAllChanges,
        commitChanges,
        gitPull,
        gitPush,
        terminalSessions,
        activeTerminalSessionId,
        activeTerminalSession,
        setActiveTerminalSessionId,
        createTerminalSession,
        closeTerminalSession,
        terminalLines,
        terminalRunning,
        setTerminalRunning,
        sendTerminalCommand,
        clearTerminal,
        sessions,
        activeSessionId,
        activeSession,
        activeProvider,
        activeModel,
        createSession,
        switchSession,
        deleteSession,
        setSessionModel,
        chatMessages,
        sendChatMessage,
        toast,
        showToast,
        clearToast,
        runAction,
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  )
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext)
  if (!context) {
    throw new Error("useWorkbench must be used within a WorkbenchProvider")
  }
  return context
}

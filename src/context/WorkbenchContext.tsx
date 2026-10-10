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
  ChatMessage,
  DiagnosticItem,
  FileItem,
  GitChange,
  NotificationItem,
} from "../types/workbench"
import {
  initialDiagnostics,
  initialFiles,
  initialGitChanges,
  initialNotifications,
  initialTerminalLines,
} from "../data/mockData"

interface WorkbenchContextType {
  // Layout toggles
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  togglePanel: () => void
  chatOpen: boolean
  setChatOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleChat: () => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  splitEditor: boolean
  setSplitEditor: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleSplitEditor: () => void

  // Activity & Navigation
  activeActivity: ActivityType
  setActiveActivity: (activity: ActivityType) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  tabs: string[]
  closeTab: (tab: string) => void
  activeLanguage: string
  setActiveLanguage: (lang: string) => void

  // Workspace Data
  files: FileItem[]
  diagnostics: DiagnosticItem[]
  notifications: NotificationItem[]
  markAllNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  activeBranch: string
  setActiveBranch: (branch: string) => void
  gitChanges: GitChange[]

  // Terminal
  terminalLines: string[]
  terminalRunning: boolean
  setTerminalRunning: (value: boolean | ((prev: boolean) => boolean)) => void
  sendTerminalCommand: (command: string) => void
  clearTerminal: () => void

  // Chat Agent
  chatMessages: ChatMessage[]
  sendChatMessage: (text: string) => void

  // Toast & Global Actions
  toast: string
  showToast: (message: string) => void
  clearToast: () => void
  runAction: (action: string) => void
}

const WorkbenchContext = createContext<WorkbenchContextType | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [splitEditor, setSplitEditor] = useState(false)

  // Activity & Editor states
  const [activeActivity, setActiveActivity] = useState<ActivityType>("Explorer")
  const [activeTab, setActiveTab] = useState("App.tsx")
  const [tabs, setTabs] = useState(["App.tsx", "Status.tsx"])
  const [activeLanguage, setActiveLanguage] = useState("TypeScript")

  // Data states
  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const [diagnostics, setDiagnostics] =
    useState<DiagnosticItem[]>(initialDiagnostics)
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications)
  const [activeBranch, setActiveBranch] = useState("main")
  const [gitChanges, setGitChanges] = useState<GitChange[]>(initialGitChanges)

  // Terminal state
  const [terminalLines, setTerminalLines] =
    useState<string[]>(initialTerminalLines)
  const [terminalRunning, setTerminalRunning] = useState(true)

  // Chat state
  const [chatMessages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      role: "agent",
      text: "I'm connected to your local workspace. What should we build next?",
    },
  ])

  // Toast state
  const [toast, setToast] = useState("")

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [])
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), [])
  const toggleChat = useCallback(() => setChatOpen((v) => !v), [])
  const toggleSplitEditor = useCallback(() => setSplitEditor((v) => !v), [])

  const closeTab = useCallback(
    (tabToClose: string) => {
      setTabs((currentTabs) => {
        const filtered = currentTabs.filter((t) => t !== tabToClose)
        if (filtered.length > 0 && activeTab === tabToClose) {
          setActiveTab(filtered[0])
        }
        return filtered
      })
    },
    [activeTab],
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 2200)
  }, [])

  const clearToast = useCallback(() => setToast(""), [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
  }, [])

  const clearTerminal = useCallback(() => {
    setTerminalLines([])
  }, [])

  const sendTerminalCommand = useCallback((commandText: string) => {
    const value = commandText.trim()
    if (!value) return

    if (value === "clear") {
      setTerminalLines([])
    } else if (value === "lint") {
      setTerminalLines((lines) => [
        ...lines,
        `$ ${value}`,
        "Lint complete · 1 error, 1 warning · 42 ms",
      ])
    } else if (value.startsWith("echo ")) {
      setTerminalLines((lines) => [...lines, `$ ${value}`, value.slice(5)])
    } else {
      setTerminalLines((lines) => [
        ...lines,
        `$ ${value}`,
        `command queued locally: ${value}`,
      ])
    }
  }, [])

  const sendChatMessage = useCallback((text: string) => {
    const cleanText = text.trim()
    if (!cleanText) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: cleanText,
    }
    setMessages((prev) => [...prev, userMsg])
  }, [])

  const runAction = useCallback(
    (action: string) => {
      const actionMessages: Record<string, string> = {
        "clear-terminal": "Terminal output cleared",
        find: "Find widget opened for App.tsx",
        "new-file": "Untitled-1 created",
        "open-folder": "Folder picker ready",
        redo: "Nothing to redo",
        run: "Run session queued without debugging",
        "run-file": "Running App.tsx",
        save: "App.tsx saved",
        stop: "Active run session stopped",
        undo: "Last editor action reverted",
      }

      if (action === "commands") {
        setCommandPaletteOpen(true)
      } else if (action === "sidebar") {
        toggleSidebar()
      } else if (action === "panel" || action === "new-terminal") {
        togglePanel()
      } else {
        showToast(actionMessages[action] ?? "Command completed")
      }
    },
    [showToast, togglePanel, toggleSidebar],
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
        showToast("App.tsx saved")
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showToast, togglePanel, toggleSidebar])

  return (
    <WorkbenchContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        panelOpen,
        setPanelOpen,
        togglePanel,
        chatOpen,
        setChatOpen,
        toggleChat,
        commandPaletteOpen,
        setCommandPaletteOpen,
        splitEditor,
        setSplitEditor,
        toggleSplitEditor,
        activeActivity,
        setActiveActivity,
        activeTab,
        setActiveTab,
        tabs,
        closeTab,
        activeLanguage,
        setActiveLanguage,
        files,
        diagnostics,
        notifications,
        markAllNotificationsRead,
        markNotificationRead,
        activeBranch,
        setActiveBranch,
        gitChanges,
        terminalLines,
        terminalRunning,
        setTerminalRunning,
        sendTerminalCommand,
        clearTerminal,
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

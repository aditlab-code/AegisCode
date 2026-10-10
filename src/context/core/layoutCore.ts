import { useCallback, useEffect, useState } from "react"
import type { BottomTab, ThemeMode } from "../../types/workbench"

export const DEFAULT_SIDEBAR_WIDTH = 220
export const MIN_SIDEBAR_WIDTH = 160
export const MAX_SIDEBAR_WIDTH = 460

export const DEFAULT_CHAT_WIDTH = 300
export const MIN_CHAT_WIDTH = 260
export const MAX_CHAT_WIDTH = 600

export const DEFAULT_BOTTOM_HEIGHT = 180
export const MIN_BOTTOM_HEIGHT = 100

export const DEFAULT_BOTTOM_TAB_ORDER: BottomTab[] = [
  "Terminal",
  "Problems",
  "Output",
]

// Pure transition functions
export function reorderBottomTabsLogic(
  order: BottomTab[],
  sourceIndex: number,
  targetIndex: number,
): BottomTab[] {
  if (
    sourceIndex < 0 ||
    sourceIndex >= order.length ||
    targetIndex < 0 ||
    targetIndex >= order.length ||
    sourceIndex === targetIndex
  ) {
    return order
  }
  const next = [...order]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function toggleThemeLogic(current: ThemeMode): ThemeMode {
  return current === "dark" ? "light" : "dark"
}

export function loadStoredBottomTabOrder(): BottomTab[] {
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

export function loadStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark"
  try {
    const stored = window.localStorage.getItem("aegis_theme")
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // fallback
  }
  return "dark"
}

export function loadStoredNumber(
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

export function useLayoutCore() {
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
          // ignore
        }
        return next
      })
    },
    [],
  )

  const toggleTheme = useCallback(() => {
    setTheme((prev) => toggleThemeLogic(prev))
  }, [setTheme])

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme)
    }
  }, [theme])

  // Dimensions
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

  const [lastSidebarWidth, setLastSidebarWidth] = useState<number>(sidebarWidth)
  const [lastChatWidth, setLastChatWidth] = useState<number>(chatDrawerWidth)
  const [lastBottomHeight, setLastBottomHeight] =
    useState<number>(bottomPanelHeight)

  const setSidebarWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setSidebarWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_SIDEBAR_WIDTH) {
          setLastSidebarWidth(next)
          try {
            window.localStorage.setItem("aegis_sidebar_width", String(next))
          } catch {}
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
    } catch {}
  }, [])

  const setChatDrawerWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setChatDrawerWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_CHAT_WIDTH) {
          setLastChatWidth(next)
          try {
            window.localStorage.setItem("aegis_chat_width", String(next))
          } catch {}
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
    } catch {}
  }, [])

  const setBottomPanelHeight = useCallback(
    (value: number | ((prev: number) => number)) => {
      setBottomPanelHeightState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_BOTTOM_HEIGHT) {
          setLastBottomHeight(next)
          try {
            window.localStorage.setItem("aegis_bottom_height", String(next))
          } catch {}
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
    } catch {}
  }, [])

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

  const togglePanelMaximized = useCallback(() => {
    setPanelMaximized((prev) => !prev)
  }, [])

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

  const toggleChatSessions = useCallback(() => {
    setChatSessionsOpen((prev) => !prev)
  }, [])

  const reorderBottomTabs = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      setBottomTabOrder((prev) =>
        reorderBottomTabsLogic(prev, sourceIndex, targetIndex),
      )
    },
    [],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "aegis_bottom_panel_tab_order",
        JSON.stringify(bottomTabOrder),
      )
    } catch {}
  }, [bottomTabOrder])

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

  return {
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
  }
}

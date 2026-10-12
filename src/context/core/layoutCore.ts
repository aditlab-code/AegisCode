import { useCallback, useEffect, useRef, useState } from "react"
import type { BottomTab, ThemeMode } from "../../types/workbench"

export const DEFAULT_SIDEBAR_WIDTH = 260
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 460
export const COLLAPSE_SIDEBAR_THRESHOLD = 160

export const DEFAULT_CHAT_WIDTH = 340
export const MIN_CHAT_WIDTH = 300
export const MAX_CHAT_WIDTH = 600
export const COLLAPSE_CHAT_THRESHOLD = 180

export const DEFAULT_CHAT_EXPANDED_WIDTH = 500
export const MIN_CHAT_EXPANDED_WIDTH = 480
export const COLLAPSE_CHAT_EXPANDED_THRESHOLD = 320

export const DEFAULT_BOTTOM_HEIGHT = 180
export const MIN_BOTTOM_HEIGHT = 100

export const DEFAULT_BOTTOM_TAB_ORDER: BottomTab[] = [
  "Terminal",
  "Problems",
  "Output",
  "Debug",
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
        parsed.includes("Terminal") &&
        parsed.includes("Problems") &&
        parsed.includes("Output")
      ) {
        if (!parsed.includes("Debug")) {
          parsed.push("Debug")
        }
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
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("")
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
  const [lastNormalChatWidth, setLastNormalChatWidth] = useState<number>(() =>
    chatDrawerWidth >= MIN_CHAT_WIDTH ? chatDrawerWidth : DEFAULT_CHAT_WIDTH,
  )
  const [lastExpandedChatWidth, setLastExpandedChatWidth] = useState<number>(
    DEFAULT_CHAT_EXPANDED_WIDTH,
  )
  const [lastBottomHeight, setLastBottomHeight] =
    useState<number>(bottomPanelHeight)

  const storageTimersRef =
    useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const debouncedSetItem = useCallback((key: string, val: string) => {
    if (typeof window === "undefined") return
    if (storageTimersRef.current[key]) {
      clearTimeout(storageTimersRef.current[key])
    }
    storageTimersRef.current[key] = setTimeout(() => {
      try {
        window.localStorage.setItem(key, val)
      } catch {}
      delete storageTimersRef.current[key]
    }, 250)
  }, [])

  useEffect(() => {
    return () => {
      Object.values(storageTimersRef.current).forEach((t) => clearTimeout(t))
    }
  }, [])

  const setSidebarWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setSidebarWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_SIDEBAR_WIDTH) {
          setLastSidebarWidth(next)
          debouncedSetItem("aegis_sidebar_width", String(next))
        }
        return next
      })
    },
    [debouncedSetItem],
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
        if (chatSessionsOpen) {
          if (next >= MIN_CHAT_EXPANDED_WIDTH) {
            setLastExpandedChatWidth(next)
          }
        } else {
          if (next >= MIN_CHAT_WIDTH) {
            setLastNormalChatWidth(next)
            debouncedSetItem("aegis_chat_width", String(next))
          }
        }
        return next
      })
    },
    [chatSessionsOpen, debouncedSetItem],
  )

  const resetChatDrawerWidth = useCallback(() => {
    if (chatSessionsOpen) {
      setChatDrawerWidthState(DEFAULT_CHAT_EXPANDED_WIDTH)
      setLastExpandedChatWidth(DEFAULT_CHAT_EXPANDED_WIDTH)
    } else {
      setChatDrawerWidthState(DEFAULT_CHAT_WIDTH)
      setLastNormalChatWidth(DEFAULT_CHAT_WIDTH)
      try {
        window.localStorage.setItem(
          "aegis_chat_width",
          String(DEFAULT_CHAT_WIDTH),
        )
      } catch {}
    }
  }, [chatSessionsOpen])

  const setBottomPanelHeight = useCallback(
    (value: number | ((prev: number) => number)) => {
      setBottomPanelHeightState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        if (next >= MIN_BOTTOM_HEIGHT) {
          setLastBottomHeight(next)
          debouncedSetItem("aegis_bottom_height", String(next))
        }
        return next
      })
    },
    [debouncedSetItem],
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
      if (next) {
        const minW = chatSessionsOpen ? MIN_CHAT_EXPANDED_WIDTH : MIN_CHAT_WIDTH
        const fallbackW = chatSessionsOpen
          ? lastExpandedChatWidth >= MIN_CHAT_EXPANDED_WIDTH
            ? lastExpandedChatWidth
            : DEFAULT_CHAT_EXPANDED_WIDTH
          : lastNormalChatWidth >= MIN_CHAT_WIDTH
            ? lastNormalChatWidth
            : DEFAULT_CHAT_WIDTH
        if (chatDrawerWidth < minW) {
          setChatDrawerWidthState(fallbackW)
        }
      }
      return next
    })
  }, [
    chatDrawerWidth,
    chatSessionsOpen,
    lastExpandedChatWidth,
    lastNormalChatWidth,
  ])

  const toggleChatSessions = useCallback(() => {
    setChatSessionsOpen((prev) => {
      const willBeOpen = !prev
      if (willBeOpen) {
        setLastNormalChatWidth((prevNormal) => {
          return chatDrawerWidth >= MIN_CHAT_WIDTH
            ? chatDrawerWidth
            : prevNormal
        })
        setChatDrawerWidthState(
          lastExpandedChatWidth >= MIN_CHAT_EXPANDED_WIDTH
            ? lastExpandedChatWidth
            : DEFAULT_CHAT_EXPANDED_WIDTH,
        )
      } else {
        setLastExpandedChatWidth((prevExpanded) => {
          return chatDrawerWidth >= MIN_CHAT_EXPANDED_WIDTH
            ? chatDrawerWidth
            : prevExpanded
        })
        setChatDrawerWidthState(
          lastNormalChatWidth >= MIN_CHAT_WIDTH
            ? lastNormalChatWidth
            : DEFAULT_CHAT_WIDTH,
        )
      }
      return willBeOpen
    })
  }, [chatDrawerWidth, lastExpandedChatWidth, lastNormalChatWidth])

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
          // If sessions open, close sessions first to preserve chat
          if (chatSessionsOpen) {
            setChatSessionsOpen(false)
            setChatDrawerWidthState(
              lastNormalChatWidth >= MIN_CHAT_WIDTH
                ? lastNormalChatWidth
                : DEFAULT_CHAT_WIDTH,
            )
          } else {
            const maxChatPossible = winWidth - 44 - currentSidebar - 320
            if (maxChatPossible < MIN_CHAT_WIDTH) {
              setChatOpen(false)
            } else {
              setChatDrawerWidthState(Math.floor(maxChatPossible))
            }
          }
        }
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [
    chatOpen,
    chatSessionsOpen,
    sidebarOpen,
    sidebarWidth,
    chatDrawerWidth,
    lastNormalChatWidth,
  ])

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
    commandPaletteQuery,
    setCommandPaletteQuery,
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

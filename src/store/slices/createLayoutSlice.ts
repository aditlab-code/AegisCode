import type {
  BottomTab,
  ThemeMode,
  ThemePaletteId,
} from "../../types/workbench"
import type { LayoutSlice, SliceCreator, WorkbenchStore } from "../types"
import { applyThemeToDom } from "../../themes/themeRegistry"

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
  "Debug Console",
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
      const parsed = JSON.parse(raw) as (string | BottomTab)[]
      if (Array.isArray(parsed)) {
        const migrated = parsed.map((t) =>
          t === "Debug" ? "Debug Console" : t,
        ) as BottomTab[]
        if (
          migrated.includes("Terminal") &&
          migrated.includes("Problems") &&
          migrated.includes("Output")
        ) {
          if (!migrated.includes("Debug Console")) {
            migrated.push("Debug Console")
          }
          return migrated.filter(
            (t): t is BottomTab =>
              t === "Terminal" ||
              t === "Problems" ||
              t === "Output" ||
              t === "Debug Console",
          )
        }
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

export const createLayoutSlice: SliceCreator<LayoutSlice> = (set, get) => {
  let lastSidebarWidth = loadStoredNumber(
    "aegis_sidebar_width",
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
  )
  let lastNormalChatWidth = loadStoredNumber(
    "aegis_chat_width",
    DEFAULT_CHAT_WIDTH,
    MIN_CHAT_WIDTH,
    MAX_CHAT_WIDTH,
  )
  if (lastNormalChatWidth < MIN_CHAT_WIDTH) {
    lastNormalChatWidth = DEFAULT_CHAT_WIDTH
  }
  let lastExpandedChatWidth = DEFAULT_CHAT_EXPANDED_WIDTH
  let lastBottomHeight = loadStoredNumber(
    "aegis_bottom_height",
    DEFAULT_BOTTOM_HEIGHT,
    MIN_BOTTOM_HEIGHT,
    800,
  )

  const storageTimers: Record<string, ReturnType<typeof setTimeout>> = {}

  function debouncedSetItem(key: string, val: string): void {
    if (typeof window === "undefined") return
    if (storageTimers[key]) {
      clearTimeout(storageTimers[key])
    }
    storageTimers[key] = setTimeout(() => {
      try {
        window.localStorage.setItem(key, val)
      } catch {
        // ignore
      }
      delete storageTimers[key]
    }, 250)
  }

  const initialTheme = loadStoredTheme()
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", initialTheme)
  }

  return {
    sidebarOpen: true,
    setSidebarOpen: (open) => {
      set((state) => ({
        sidebarOpen:
          typeof open === "function" ? open(state.sidebarOpen) : open,
      }))
    },
    toggleSidebar: () => {
      const { sidebarOpen, sidebarWidth } = get()
      const next = !sidebarOpen
      if (next && sidebarWidth < MIN_SIDEBAR_WIDTH) {
        const nextWidth =
          lastSidebarWidth >= MIN_SIDEBAR_WIDTH
            ? lastSidebarWidth
            : DEFAULT_SIDEBAR_WIDTH
        set({ sidebarOpen: next, sidebarWidth: nextWidth })
      } else {
        set({ sidebarOpen: next })
      }
    },

    panelOpen: true,
    setPanelOpen: (open) => {
      set((state) => ({
        panelOpen: typeof open === "function" ? open(state.panelOpen) : open,
      }))
    },
    togglePanel: () => {
      const { panelOpen, bottomPanelHeight } = get()
      const next = !panelOpen
      if (next && bottomPanelHeight < MIN_BOTTOM_HEIGHT) {
        const nextHeight =
          lastBottomHeight >= MIN_BOTTOM_HEIGHT
            ? lastBottomHeight
            : DEFAULT_BOTTOM_HEIGHT
        set({ panelOpen: next, bottomPanelHeight: nextHeight })
      } else {
        set({ panelOpen: next })
      }
    },

    panelMaximized: false,
    setPanelMaximized: (max) => {
      set((state) => ({
        panelMaximized:
          typeof max === "function" ? max(state.panelMaximized) : max,
      }))
    },
    togglePanelMaximized: () => {
      set((state) => ({ panelMaximized: !state.panelMaximized }))
    },

    activeBottomTab: "Terminal",
    setActiveBottomTab: (tab) => {
      set({ activeBottomTab: tab })
    },
    bottomTabOrder: loadStoredBottomTabOrder(),
    reorderBottomTabs: (sourceIndex, targetIndex) => {
      set((state) => {
        const nextOrder = reorderBottomTabsLogic(
          state.bottomTabOrder,
          sourceIndex,
          targetIndex,
        )
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              "aegis_bottom_panel_tab_order",
              JSON.stringify(nextOrder),
            )
          } catch {
            // ignore
          }
        }
        return { bottomTabOrder: nextOrder }
      })
    },

    chatOpen: true,
    setChatOpen: (open) => {
      set((state) => ({
        chatOpen: typeof open === "function" ? open(state.chatOpen) : open,
      }))
    },
    toggleChat: () => {
      const { chatOpen, chatSessionsOpen, chatDrawerWidth } = get()
      const next = !chatOpen
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
          set({ chatOpen: next, chatDrawerWidth: fallbackW })
          return
        }
      }
      set({ chatOpen: next })
    },

    chatSessionsOpen: false,
    setChatSessionsOpen: (open) => {
      set((state) => ({
        chatSessionsOpen:
          typeof open === "function" ? open(state.chatSessionsOpen) : open,
      }))
    },
    toggleChatSessions: () => {
      const { chatSessionsOpen, chatDrawerWidth } = get()
      const willBeOpen = !chatSessionsOpen
      if (willBeOpen) {
        if (chatDrawerWidth >= MIN_CHAT_WIDTH) {
          lastNormalChatWidth = chatDrawerWidth
        }
        const newWidth =
          lastExpandedChatWidth >= MIN_CHAT_EXPANDED_WIDTH
            ? lastExpandedChatWidth
            : DEFAULT_CHAT_EXPANDED_WIDTH
        set({ chatSessionsOpen: willBeOpen, chatDrawerWidth: newWidth })
      } else {
        if (chatDrawerWidth >= MIN_CHAT_EXPANDED_WIDTH) {
          lastExpandedChatWidth = chatDrawerWidth
        }
        const newWidth =
          lastNormalChatWidth >= MIN_CHAT_WIDTH
            ? lastNormalChatWidth
            : DEFAULT_CHAT_WIDTH
        set({ chatSessionsOpen: willBeOpen, chatDrawerWidth: newWidth })
      }
    },

    commandPaletteOpen: false,
    setCommandPaletteOpen: (open) => {
      set((state) => ({
        commandPaletteOpen:
          typeof open === "function" ? open(state.commandPaletteOpen) : open,
      }))
    },
    commandPaletteQuery: "",
    setCommandPaletteQuery: (query) => {
      set({ commandPaletteQuery: query })
    },

    settingsModalOpen: false,
    setSettingsModalOpen: (open) => {
      set((state) => ({
        settingsModalOpen:
          typeof open === "function" ? open(state.settingsModalOpen) : open,
      }))
    },
    settingsModalCategory: "Editor",
    setSettingsModalCategory: (cat) => {
      set({ settingsModalCategory: cat })
    },
    openSettingsModal: (category?: string) => {
      set({
        settingsModalOpen: true,
        ...(category ? { settingsModalCategory: category } : {}),
      })
    },
    toggleSettingsModal: () => {
      set((state) => ({ settingsModalOpen: !state.settingsModalOpen }))
    },

    theme: initialTheme,
    themePalette: "default",
    setTheme: (mode) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("aegis_theme", mode)
        } catch {
          // ignore
        }
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", mode)
        }
      }
      const currentPalette = get().themePalette || "default"
      applyThemeToDom(currentPalette, mode)
      set((state) => {
        const patch: Partial<WorkbenchStore> = { theme: mode }
        if (state.settings) {
          patch.settings = {
            ...state.settings,
            workbench: {
              ...state.settings.workbench,
              appearance: {
                ...state.settings.workbench.appearance,
                mode,
              },
            },
          }
        }
        return patch as any
      })
    },
    setThemePalette: (palette) => {
      const currentMode = get().theme || "dark"
      applyThemeToDom(palette, currentMode)
      set((state) => {
        const patch: Partial<WorkbenchStore> = { themePalette: palette }
        if (state.settings) {
          patch.settings = {
            ...state.settings,
            workbench: {
              ...state.settings.workbench,
              appearance: {
                ...state.settings.workbench.appearance,
                palette,
              },
            },
          }
        }
        return patch as any
      })
    },
    toggleTheme: () => {
      const current = get().theme
      const next = toggleThemeLogic(current)
      get().setTheme(next)
    },

    sidebarWidth: loadStoredNumber(
      "aegis_sidebar_width",
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
    setSidebarWidth: (w) => {
      if (w >= MIN_SIDEBAR_WIDTH) {
        lastSidebarWidth = w
        debouncedSetItem("aegis_sidebar_width", String(w))
      }
      set({ sidebarWidth: w })
    },
    resetSidebarWidth: () => {
      lastSidebarWidth = DEFAULT_SIDEBAR_WIDTH
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "aegis_sidebar_width",
            String(DEFAULT_SIDEBAR_WIDTH),
          )
        } catch {
          // ignore
        }
      }
      set({ sidebarWidth: DEFAULT_SIDEBAR_WIDTH })
    },

    chatDrawerWidth: loadStoredNumber(
      "aegis_chat_width",
      DEFAULT_CHAT_WIDTH,
      MIN_CHAT_WIDTH,
      MAX_CHAT_WIDTH,
    ),
    setChatDrawerWidth: (w) => {
      const { chatSessionsOpen } = get()
      if (chatSessionsOpen) {
        if (w >= MIN_CHAT_EXPANDED_WIDTH) {
          lastExpandedChatWidth = w
        }
      } else {
        if (w >= MIN_CHAT_WIDTH) {
          lastNormalChatWidth = w
          debouncedSetItem("aegis_chat_width", String(w))
        }
      }
      set({ chatDrawerWidth: w })
    },
    resetChatDrawerWidth: () => {
      const { chatSessionsOpen } = get()
      if (chatSessionsOpen) {
        lastExpandedChatWidth = DEFAULT_CHAT_EXPANDED_WIDTH
        set({ chatDrawerWidth: DEFAULT_CHAT_EXPANDED_WIDTH })
      } else {
        lastNormalChatWidth = DEFAULT_CHAT_WIDTH
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              "aegis_chat_width",
              String(DEFAULT_CHAT_WIDTH),
            )
          } catch {
            // ignore
          }
        }
        set({ chatDrawerWidth: DEFAULT_CHAT_WIDTH })
      }
    },

    bottomPanelHeight: loadStoredNumber(
      "aegis_bottom_height",
      DEFAULT_BOTTOM_HEIGHT,
      MIN_BOTTOM_HEIGHT,
      800,
    ),
    setBottomPanelHeight: (h) => {
      if (h >= MIN_BOTTOM_HEIGHT) {
        lastBottomHeight = h
        debouncedSetItem("aegis_bottom_height", String(h))
      }
      set({ bottomPanelHeight: h })
    },
    resetBottomPanelHeight: () => {
      lastBottomHeight = DEFAULT_BOTTOM_HEIGHT
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "aegis_bottom_height",
            String(DEFAULT_BOTTOM_HEIGHT),
          )
        } catch {
          // ignore
        }
      }
      set({ bottomPanelHeight: DEFAULT_BOTTOM_HEIGHT })
    },
  }
}

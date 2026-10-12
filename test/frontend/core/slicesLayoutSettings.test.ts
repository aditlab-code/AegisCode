import { describe, it, expect } from "vitest"
import { create } from "zustand"
import {
  createLayoutSlice,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  COLLAPSE_SIDEBAR_THRESHOLD,
  DEFAULT_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  COLLAPSE_CHAT_THRESHOLD,
  DEFAULT_CHAT_EXPANDED_WIDTH,
  MIN_CHAT_EXPANDED_WIDTH,
  COLLAPSE_CHAT_EXPANDED_THRESHOLD,
  DEFAULT_BOTTOM_HEIGHT,
  MIN_BOTTOM_HEIGHT,
  DEFAULT_BOTTOM_TAB_ORDER,
  reorderBottomTabsLogic,
  toggleThemeLogic,
  loadStoredBottomTabOrder,
  loadStoredTheme,
  loadStoredNumber,
} from "@/store/slices/createLayoutSlice"
import {
  createSettingsSlice,
  DEFAULT_APP_SETTINGS,
  loadStoredSettings,
  saveStoredSettings,
  applyTypographyVariables,
} from "@/store/slices/createSettingsSlice"
import type { LayoutSlice, SettingsSlice } from "@/store/types"

describe("createLayoutSlice", () => {
  it("exports all expected layout constants and pure functions", () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(260)
    expect(MIN_SIDEBAR_WIDTH).toBe(220)
    expect(MAX_SIDEBAR_WIDTH).toBe(460)
    expect(COLLAPSE_SIDEBAR_THRESHOLD).toBe(160)
    expect(DEFAULT_CHAT_WIDTH).toBe(340)
    expect(MIN_CHAT_WIDTH).toBe(300)
    expect(MAX_CHAT_WIDTH).toBe(600)
    expect(COLLAPSE_CHAT_THRESHOLD).toBe(180)
    expect(DEFAULT_CHAT_EXPANDED_WIDTH).toBe(500)
    expect(MIN_CHAT_EXPANDED_WIDTH).toBe(480)
    expect(COLLAPSE_CHAT_EXPANDED_THRESHOLD).toBe(320)
    expect(DEFAULT_BOTTOM_HEIGHT).toBe(180)
    expect(MIN_BOTTOM_HEIGHT).toBe(100)
    expect(DEFAULT_BOTTOM_TAB_ORDER).toEqual([
      "Terminal",
      "Problems",
      "Output",
      "Debug",
    ])

    expect(toggleThemeLogic("dark")).toBe("light")
    expect(toggleThemeLogic("light")).toBe("dark")

    const tabs = ["Terminal", "Problems", "Output", "Debug"] as const
    expect(reorderBottomTabsLogic([...tabs], 0, 2)).toEqual([
      "Problems",
      "Output",
      "Terminal",
      "Debug",
    ])
  })

  it("creates layout slice with valid state and updates", () => {
    const useTestStore = create<LayoutSlice & SettingsSlice>()((...a) => ({
      ...createLayoutSlice(...a as any),
      ...createSettingsSlice(...a as any),
    }))

    const store = useTestStore.getState()
    expect(store.sidebarOpen).toBe(true)
    expect(store.panelOpen).toBe(true)
    expect(store.panelMaximized).toBe(false)
    expect(store.activeBottomTab).toBe("Terminal")
    expect(store.chatOpen).toBe(true)

    // Toggle actions
    useTestStore.getState().toggleSidebar()
    expect(useTestStore.getState().sidebarOpen).toBe(false)
    useTestStore.getState().toggleSidebar()
    expect(useTestStore.getState().sidebarOpen).toBe(true)

    useTestStore.getState().togglePanel()
    expect(useTestStore.getState().panelOpen).toBe(false)
    useTestStore.getState().togglePanel()
    expect(useTestStore.getState().panelOpen).toBe(true)

    useTestStore.getState().togglePanelMaximized()
    expect(useTestStore.getState().panelMaximized).toBe(true)

    // Dimension setters
    useTestStore.getState().setSidebarWidth(300)
    expect(useTestStore.getState().sidebarWidth).toBe(300)
    useTestStore.getState().resetSidebarWidth()
    expect(useTestStore.getState().sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH)

    // Theme toggle
    const initialTheme = useTestStore.getState().theme
    useTestStore.getState().toggleTheme()
    expect(useTestStore.getState().theme).toBe(
      initialTheme === "dark" ? "light" : "dark",
    )
  })
})

describe("createSettingsSlice", () => {
  it("exports all expected settings constants and pure functions", () => {
    expect(DEFAULT_APP_SETTINGS).toBeDefined()
    expect(DEFAULT_APP_SETTINGS.workbench.appearance.palette).toBe("default")
    expect(typeof loadStoredSettings).toBe("function")
    expect(typeof saveStoredSettings).toBe("function")
    expect(typeof applyTypographyVariables).toBe("function")
  })

  it("updates settings and appearance accurately", () => {
    const useTestStore = create<LayoutSlice & SettingsSlice>()((...a) => ({
      ...createLayoutSlice(...a as any),
      ...createSettingsSlice(...a as any),
    }))

    // Editor settings update
    useTestStore.getState().updateEditorSettings({ fontSize: 16 })
    expect(useTestStore.getState().settings.editor.fontSize).toBe(16)

    // Workbench settings update
    useTestStore.getState().updateWorkbenchSettings({ fontSize: 14 })
    expect(useTestStore.getState().settings.workbench.appearance.fontSize).toBe(
      14,
    )

    // Palette change
    useTestStore.getState().setThemePalette("tokyo-night")
    expect(useTestStore.getState().settings.workbench.appearance.palette).toBe(
      "tokyo-night",
    )
    expect(useTestStore.getState().themePalette).toBe("tokyo-night")

    // Theme mode change
    useTestStore.getState().setThemeMode("light")
    expect(useTestStore.getState().settings.workbench.appearance.mode).toBe(
      "light",
    )
    expect(useTestStore.getState().theme).toBe("light")

    // Reset settings
    useTestStore.getState().resetSettings()
    expect(useTestStore.getState().settings.editor.fontSize).toBe(
      DEFAULT_APP_SETTINGS.editor.fontSize,
    )
  })
})

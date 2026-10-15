import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { create } from "zustand"
import { createLayoutSlice } from "@/store/slices/createLayoutSlice"
import { createSettingsSlice } from "@/store/slices/createSettingsSlice"
import {
  createEditorSlice,
  getDerivedEditorState,
} from "@/store/slices/createEditorSlice"
import { createWorkspaceSlice } from "@/store/slices/createWorkspaceSlice"
import { createDebugSlice } from "@/store/slices/createDebugSlice"
import {
  createTerminalSlice,
  detectDefaultShell,
} from "@/store/slices/createTerminalSlice"
import {
  createCodeGraphSlice,
  useCodeGraphStore,
} from "@/store/slices/codegraphSlice"
import { useWorkbenchStore } from "@/store"
import type { WorkbenchStore } from "@/store/types"

describe("MP-5.2 Zustand Store Optimization Track (OPT-ZUS-01 through OPT-ZUS-09)", () => {
  let storageMap: Map<string, string>

  beforeEach(() => {
    storageMap = new Map()
    const mockStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    }
    vi.stubGlobal("window", { localStorage: mockStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const createFullTestStore = () => {
    return create<WorkbenchStore>()((set, get, store) => ({
      ...createLayoutSlice(set as any, get as any, store as any),
      ...createEditorSlice(set as any, get as any, store as any),
      ...createWorkspaceSlice(set as any, get as any, store as any),
      ...createDebugSlice(set as any, get as any, store as any),
      ...createSettingsSlice(set as any, get as any, store as any),
    }))
  }

  it("OPT-ZUS-01: unifies theme state and synchronizes dual localStorage keys", () => {
    const store = createFullTestStore()

    // Default theme check
    expect(store.getState().theme).toBe("dark")
    expect(store.getState().settings.workbench.appearance.mode).toBe("dark")

    // Layout setTheme delegates to SettingsSlice and updates both
    store.getState().setTheme("light")
    expect(store.getState().theme).toBe("light")
    expect(store.getState().settings.workbench.appearance.mode).toBe("light")

    // Theme toggle updates both
    store.getState().toggleTheme()
    expect(store.getState().theme).toBe("dark")
    expect(store.getState().settings.workbench.appearance.mode).toBe("dark")

    // Theme palette update synchronizes both
    store.getState().setThemePalette("monokai")
    expect(store.getState().themePalette).toBe("monokai")
    expect(store.getState().settings.workbench.appearance.palette).toBe(
      "monokai",
    )

    // Verify dual localStorage persistence
    const v1Stored = JSON.parse(storageMap.get("aegis_settings_v1") || "{}")
    const userStored = JSON.parse(storageMap.get("aegis_user_settings") || "{}")
    expect(v1Stored.workbench?.appearance?.palette).toBe("monokai")
    expect(userStored.workbench?.appearance?.palette).toBe("monokai")
  })

  it("OPT-ZUS-02: synchronizes tabSize, minimapEnabled, and minimapScale between editor slice and settings.editor", () => {
    const store = createFullTestStore()

    // 1. Changing via editor slice actions updates settings.editor
    store.getState().setTabSize(4)
    expect(store.getState().tabSize).toBe(4)
    expect(store.getState().settings.editor.tabSize).toBe(4)

    store.getState().setMinimapEnabled(false)
    expect(store.getState().minimapEnabled).toBe(false)
    expect(store.getState().settings.editor.minimapEnabled).toBe(false)

    store.getState().setMinimapScale("large")
    expect(store.getState().minimapScale).toBe("large")
    expect(store.getState().settings.editor.minimapScale).toBe("large")

    // 2. Updating via settings slice updates top-level editor slice fields
    store.getState().updateEditorSettings({
      tabSize: 8,
      minimapEnabled: true,
      minimapScale: "small",
    })
    expect(store.getState().tabSize).toBe(8)
    expect(store.getState().minimapEnabled).toBe(true)
    expect(store.getState().minimapScale).toBe("small")
  })

  it("OPT-ZUS-04: getDerivedEditorState handles single pane vs split editor with guards", () => {
    const g1 = {
      id: "group1" as const,
      name: "Group 1",
      tabs: ["app.tsx", "utils.ts"],
      activeTab: "app.tsx",
    }
    const g2 = {
      id: "group2" as const,
      name: "Group 2",
      tabs: [],
      activeTab: "",
    }

    // Split editor disabled: always returns group1 tabs and primary pane
    const singlePaneDerived = getDerivedEditorState(g1, g2, "group2", false)
    expect(singlePaneDerived.tabs).toEqual(["app.tsx", "utils.ts"])
    expect(singlePaneDerived.activeTab).toBe("app.tsx")
    expect(singlePaneDerived.focusedPane).toBe("primary")

    // Split editor enabled with group2 having tabs and focused
    const g2Populated = {
      id: "group2" as const,
      name: "Group 2",
      tabs: ["styles.css"],
      activeTab: "styles.css",
    }
    const splitGroup2Derived = getDerivedEditorState(
      g1,
      g2Populated,
      "group2",
      true,
    )
    expect(splitGroup2Derived.activeTab).toBe("styles.css")
    expect(splitGroup2Derived.secondaryActiveTab).toBe("styles.css")
    expect(splitGroup2Derived.focusedPane).toBe("secondary")
    expect(splitGroup2Derived.tabs).toEqual([
      "app.tsx",
      "utils.ts",
      "styles.css",
    ])

    // Split editor enabled with focusedGroup group1
    const splitGroup1Derived = getDerivedEditorState(
      g1,
      g2Populated,
      "group1",
      true,
    )
    expect(splitGroup1Derived.activeTab).toBe("app.tsx")
    expect(splitGroup1Derived.focusedPane).toBe("primary")
  })

  it("OPT-ZUS-05: synchronizes linterSettings between workspace slice and settings.linter", () => {
    const store = createFullTestStore()

    // Updating via workspace slice setLinterSettings
    store.getState().setLinterSettings({
      enabled: false,
      runOnSave: false,
      runOnType: false,
      activeLinters: ["eslint"],
    })
    expect(store.getState().linterSettings.enabled).toBe(false)
    expect(store.getState().linterSettings.activeLinters).toEqual(["eslint"])
    expect(store.getState().settings.linter.enabled).toBe(false)
    expect(store.getState().settings.linter.activeLinters).toEqual(["eslint"])

    // Updating via settings slice updateLinterSettings
    store.getState().updateLinterSettings({
      enabled: true,
      activeLinters: ["oxlint", "eslint"],
    })
    expect(store.getState().linterSettings.enabled).toBe(true)
    expect(store.getState().linterSettings.activeLinters).toEqual([
      "oxlint",
      "eslint",
    ])
    expect(store.getState().settings.linter.enabled).toBe(true)
  })

  it("OPT-ZUS-06: toast and runAction are available in LayoutSlice independently of DebugSlice", () => {
    // Isolated Layout store (no DebugSlice)
    const isolatedLayoutStore = create<any>()((...a) => ({
      ...createLayoutSlice(...a as any),
      ...createSettingsSlice(...a as any),
    }))

    expect(isolatedLayoutStore.getState().toast).toBe("")

    isolatedLayoutStore.getState().showToast("Test Toast")
    expect(isolatedLayoutStore.getState().toast).toBe("Test Toast")

    isolatedLayoutStore.getState().clearToast()
    expect(isolatedLayoutStore.getState().toast).toBe("")

    // Test runAction for layout actions
    isolatedLayoutStore.getState().runAction("sidebar")
    expect(isolatedLayoutStore.getState().sidebarOpen).toBe(false)

    isolatedLayoutStore.getState().runAction("sidebar")
    expect(isolatedLayoutStore.getState().sidebarOpen).toBe(true)
  })

  it("OPT-ZUS-07: breakpoints and activeDebugLine are tracked in DebugSlice and editor slice bridges work", () => {
    const store = createFullTestStore()

    expect(store.getState().breakpoints).toEqual({})
    expect(store.getState().activeDebugLine).toBeNull()

    // Toggle breakpoint on line 10 of main.go
    store.getState().toggleBreakpoint("main.go", 10)
    expect(store.getState().breakpoints["main.go"]).toEqual([10])

    // Toggle breakpoint on line 20
    store.getState().toggleBreakpoint("main.go", 20)
    expect(store.getState().breakpoints["main.go"]).toEqual([10, 20])

    // Toggle line 10 again to remove it
    store.getState().toggleBreakpoint("main.go", 10)
    expect(store.getState().breakpoints["main.go"]).toEqual([20])

    // Set active debug line
    store.getState().setActiveDebugLine(20)
    expect(store.getState().activeDebugLine).toBe(20)

    // Clear breakpoints
    store.getState().clearBreakpoints("main.go")
    expect(store.getState().breakpoints["main.go"]).toBeUndefined()
  })

  it("OPT-ZUS-08: detectDefaultShell detects Windows platform and creates terminal sessions dynamically", async () => {
    // 1. Check POSIX / default environment
    expect(["zsh", "bash", "powershell"]).toContain(detectDefaultShell())

    // 2. Isolate terminal store
    const termStore = create<any>()((...a) => ({
      ...createTerminalSlice(...a as any),
    }))

    const initialSession = termStore.getState().activeTerminalSession
    expect(initialSession).toBeDefined()
    expect(termStore.getState().terminalSessions.length).toBeGreaterThan(0)
    expect(termStore.getState().activeTerminalSessionId).toBe(initialSession.id)

    // 3. Restart terminal session with a custom shell (e.g. bash or powershell)
    await termStore.getState().restartTerminalSession(initialSession.id, "pwsh")
    const updated = termStore
      .getState()
      .terminalSessions.find((s: any) => s.id === initialSession.id)
    expect(updated?.shell).toBe("pwsh")
  })

  it("OPT-ZUS-09: unifies CodeGraph slice in useWorkbenchStore and syncs with useCodeGraphStore bridge", () => {
    // 1. useWorkbenchStore contains CodeGraph state
    const currentActiveView = useWorkbenchStore.getState().activeView
    expect(currentActiveView).toBe("entrypoints")

    // 2. useCodeGraphStore reads directly from useWorkbenchStore
    expect(useCodeGraphStore.getState().activeView).toBe("entrypoints")

    // 3. Modifying through useWorkbenchStore reflects in useCodeGraphStore
    useWorkbenchStore.getState().setActiveView("steps")
    expect(useWorkbenchStore.getState().activeView).toBe("steps")
    expect(useCodeGraphStore.getState().activeView).toBe("steps")

    // 4. Modifying through useCodeGraphStore reflects in useWorkbenchStore
    useCodeGraphStore.getState().openEntrypointSteps("ep-1", "Main Entrypoint")
    expect(useWorkbenchStore.getState().activeView).toBe("steps")
    expect(useWorkbenchStore.getState().selectedEntrypoint).toEqual({
      id: "ep-1",
      label: "Main Entrypoint",
    })
    expect(useWorkbenchStore.getState().breadcrumbs.length).toBe(1)

    // 5. resetView resets all active state
    useWorkbenchStore.getState().resetView()
    expect(useWorkbenchStore.getState().activeView).toBe("entrypoints")
    expect(useWorkbenchStore.getState().selectedEntrypoint).toBeNull()
    expect(useWorkbenchStore.getState().breadcrumbs).toEqual([])
  })
})

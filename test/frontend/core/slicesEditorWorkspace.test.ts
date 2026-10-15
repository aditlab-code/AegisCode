import { describe, it, expect, vi } from "vitest"
import { create } from "zustand"
import {
  createEditorSlice,
  openTabInGroupLogic,
  closeTabInGroupLogic,
  setActiveTabInGroupLogic,
  moveTabBetweenGroupsLogic,
  reorderTabsInGroupLogic,
  renameTabInAllGroupsLogic,
  removeTabFromAllGroupsLogic,
  loadStoredMinimapEnabled,
  loadStoredMinimapScale,
  loadStoredTabSize,
  loadStoredPinnedTabs,
  saveStoredPinnedTabs,
} from "@/store/slices/createEditorSlice"
import {
  createWorkspaceSlice,
  addFileToTreeLogic,
  removeFileFromTreeLogic,
  renameFileInTreeLogic,
  updateBufferContentLogic,
  syncBufferWithDiskLogic,
  sanitizeContentOnSave,
  markBufferSavedLogic,
  revertBufferContentLogic,
  normalizeWorkspacePath,
  AsyncSequenceGuard,
} from "@/store/slices/createWorkspaceSlice"
import { flattenBackendTree } from "@/utils/workspaceApi"
import { makeGitDiffTab, parseGitDiffTab } from "@/utils/gitDiffTab"
import type { WorkbenchStore } from "@/store/types"

describe("createEditorSlice", () => {
  it("exports all expected pure functions with correct behaviors", () => {
    const group = {
      id: "group1" as const,
      name: "G1",
      tabs: ["a.ts"],
      activeTab: "a.ts",
    }

    // openTabInGroupLogic
    const opened = openTabInGroupLogic(group, "b.ts")
    expect(opened.tabs).toEqual(["a.ts", "b.ts"])
    expect(opened.activeTab).toBe("b.ts")

    // setActiveTabInGroupLogic
    const activated = setActiveTabInGroupLogic(opened, "a.ts")
    expect(activated.activeTab).toBe("a.ts")

    // closeTabInGroupLogic
    const closed = closeTabInGroupLogic(opened, "b.ts")
    expect(closed.tabs).toEqual(["a.ts"])
    expect(closed.activeTab).toBe("a.ts")

    // moveTabBetweenGroupsLogic
    const g2 = { id: "group2" as const, name: "G2", tabs: [], activeTab: "" }
    const moved = moveTabBetweenGroupsLogic(group, g2, "a.ts")
    expect(moved.source.tabs).toEqual([])
    expect(moved.target.tabs).toEqual(["a.ts"])
    expect(moved.target.activeTab).toBe("a.ts")

    // reorderTabsInGroupLogic
    const multi = {
      id: "group1" as const,
      name: "G1",
      tabs: ["1.ts", "2.ts", "3.ts"],
      activeTab: "1.ts",
    }
    const reordered = reorderTabsInGroupLogic(multi, 0, 2)
    expect(reordered.tabs).toEqual(["2.ts", "3.ts", "1.ts"])

    // renameTabInAllGroupsLogic
    const renamed = renameTabInAllGroupsLogic(multi, g2, "1.ts", "one.ts")
    expect(renamed.group1.tabs).toEqual(["one.ts", "2.ts", "3.ts"])
    expect(renamed.group1.activeTab).toBe("one.ts")

    // removeTabFromAllGroupsLogic
    const removed = removeTabFromAllGroupsLogic(multi, g2, "1.ts")
    expect(removed.group1.tabs).toEqual(["2.ts", "3.ts"])

    // storage loaders
    expect(typeof loadStoredMinimapEnabled()).toBe("boolean")
    expect(["small", "medium", "large"]).toContain(loadStoredMinimapScale())
    expect([2, 4]).toContain(loadStoredTabSize())
  })

  it("integrates into Zustand store with responsive actions", () => {
    const editorCreator = createEditorSlice as any
    const workspaceCreator = createWorkspaceSlice as any
    const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
      ...editorCreator(set, get, store),
      ...workspaceCreator(set, get, store),
    }))

    const store = useTestStore.getState()
    expect(store.splitEditor).toBe(false)
    expect(store.group1.tabs).toEqual([])
    expect(store.focusedGroup).toBe("group1")

    // open file in group
    store.openFileInGroup("App.tsx")
    expect(useTestStore.getState().group1.tabs).toContain("App.tsx")
    expect(useTestStore.getState().activeTab).toBe("App.tsx")
    expect(useTestStore.getState().tabs).toContain("App.tsx")

    // split editor
    store.toggleSplitEditor()
    expect(useTestStore.getState().splitEditor).toBe(true)
    expect(useTestStore.getState().focusedGroup).toBe("group2")

    // tab size toggle
    const initialTabSize = useTestStore.getState().tabSize
    store.toggleTabSize()
    expect(useTestStore.getState().tabSize).toBe(initialTabSize === 2 ? 4 : 2)

    // minimap toggle
    const initMinimap = useTestStore.getState().minimapEnabled
    store.toggleMinimap()
    expect(useTestStore.getState().minimapEnabled).toBe(!initMinimap)

    // breakpoints
    void store.toggleBreakpoint("App.tsx", 15)
    expect(useTestStore.getState().breakpoints["App.tsx"]).toEqual([15])
    store.clearBreakpoints("App.tsx")
    expect(useTestStore.getState().breakpoints["App.tsx"]).toBeUndefined()
  })

  it("closes all tabs cleanly and safeguards dirty buffers", () => {
    const editorCreator = createEditorSlice as any
    const workspaceCreator = createWorkspaceSlice as any
    const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
      ...editorCreator(set, get, store),
      ...workspaceCreator(set, get, store),
    }))

    const store = useTestStore.getState()
    store.openFileInGroup("file1.ts")
    store.openFileInGroup("file2.ts")
    expect(useTestStore.getState().group1.tabs.length).toBeGreaterThanOrEqual(2)

    // Close all clean tabs
    store.closeAllTabs()
    expect(useTestStore.getState().group1.tabs).toEqual([])
    expect(useTestStore.getState().activeTab).toBe("")

    // Dirty buffer safeguard
    store.openFileInGroup("dirty.ts")
    useTestStore.setState((s) => ({
      fileBuffers: {
        ...s.fileBuffers,
        "dirty.ts": { content: "modified", isDirty: true },
      },
    }))

    store.closeAllTabs()
    // Should trigger confirmCloseFile instead of forcefully discarding
    expect(useTestStore.getState().confirmCloseFile).toEqual({
      group: "group1",
      filename: "dirty.ts",
    })
    expect(useTestStore.getState().group1.tabs).toContain("dirty.ts")
  })
})

describe("gitDiffTab utilities", () => {
  it("creates and parses git diff tab strings with base commit comparison", () => {
    const tab = makeGitDiffTab("src/main.ts", false, "commit2222", "commit1111")
    expect(tab).toBe("git-diff:src/main.ts?commit=commit2222&base=commit1111")

    const info = parseGitDiffTab(tab)
    expect(info).not.toBeNull()
    expect(info?.file).toBe("src/main.ts")
    expect(info?.commit).toBe("commit2222")
    expect(info?.base).toBe("commit1111")
    expect(info?.displayName).toBe("main.ts (commit1 ↔ commit2)")
  })
})

describe("createWorkspaceSlice", () => {
  it("exports all expected pure functions with correct behaviors", () => {
    // Tree manipulations
    const files = [
      {
        id: "src",
        name: "src",
        label: "src",
        type: "folder" as const,
        icon: "folder",
        depth: 0,
        path: "src",
      },
    ]
    const added = addFileToTreeLogic(files, "src/index.ts", false)
    expect(added.length).toBe(2)
    expect(added.some((f) => f.path === "src/index.ts")).toBe(true)

    const renamed = renameFileInTreeLogic(added, "src/index.ts", "src/main.ts")
    expect(renamed.some((f) => f.path === "src/main.ts")).toBe(true)

    const removed = removeFileFromTreeLogic(renamed, "src")
    expect(removed.length).toBe(0)

    // Buffers
    const buffers = {}
    const updated = updateBufferContentLogic(buffers, "test.ts", "const x = 1")
    expect(updated["test.ts"]?.content).toBe("const x = 1")
    expect(updated["test.ts"]?.isDirty).toBe(true)

    const synced = syncBufferWithDiskLogic(buffers, "test.ts", "const x = 1")
    expect(synced["test.ts"]?.isDirty).toBe(false)

    const saved = markBufferSavedLogic(updated, "test.ts")
    expect(saved["test.ts"]?.isDirty).toBe(false)
    expect(saved["test.ts"]?.savedContent).toBe("const x = 1")

    const reverted = revertBufferContentLogic(updated, "test.ts")
    expect(reverted["test.ts"]?.isDirty).toBe(false)

    // sanitizeContentOnSave
    expect(
      sanitizeContentOnSave("hello  \nworld   ", {
        trimTrailingWhitespace: true,
      }),
    ).toBe("hello\nworld")
    expect(sanitizeContentOnSave("hello", { insertFinalNewline: true })).toBe(
      "hello\n",
    )

    // normalizeWorkspacePath
    expect(normalizeWorkspacePath("/workspace/src/App.tsx", "/workspace")).toBe(
      "src/App.tsx",
    )

    // AsyncSequenceGuard
    const guard = new AsyncSequenceGuard()
    const req1 = guard.nextRequest()
    const req2 = guard.nextRequest()
    expect(guard.isCurrent(req1.requestId)).toBe(false)
    expect(guard.isCurrent(req2.requestId)).toBe(true)
  })

  it("integrates into Zustand store with notifications, buffers, and diagnostic actions", () => {
    const editorCreator = createEditorSlice as any
    const workspaceCreator = createWorkspaceSlice as any
    const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
      ...editorCreator(set, get, store),
      ...workspaceCreator(set, get, store),
    }))

    const store = useTestStore.getState()
    expect(store.rootWorkspaceName).toBe("AegisCode")
    expect(store.files).toEqual([])

    // Notifications
    store.addNotification("Test notification", "Detail info", "success")
    expect(
      useTestStore
        .getState()
        .notifications.some((n) => n.title === "Test notification"),
    ).toBe(true)
    const notif = useTestStore.getState().notifications[0]
    store.markNotificationRead(notif.id)
    expect(useTestStore.getState().notifications[0].read).toBe(true)
    store.clearAllNotifications()
    expect(useTestStore.getState().notifications.length).toBe(0)

    // Buffer mutations
    store.updateFileContent("main.ts", "console.log('hi')")
    expect(useTestStore.getState().fileBuffers["main.ts"]?.content).toBe(
      "console.log('hi')",
    )
    expect(useTestStore.getState().fileBuffers["main.ts"]?.isDirty).toBe(true)
    store.syncBufferWithDisk("main.ts", "console.log('hi')")
    expect(useTestStore.getState().fileBuffers["main.ts"]?.isDirty).toBe(false)

    // Diagnostics
    store.setDiagnostics([
      {
        id: "d1",
        title: "Syntax Error",
        location: "main.ts:1",
        type: "error",
        source: "ts",
      },
    ])
    expect(useTestStore.getState().diagnostics.length).toBe(1)
  })

  it("sorts directory nodes with folders first, then alphabetical", () => {
    const rawNodes = [
      { path: "zebra.txt", name: "zebra.txt", type: "file" as const, depth: 0 },
      { path: "docs", name: "docs", type: "folder" as const, depth: 0 },
      { path: "apple.txt", name: "apple.txt", type: "file" as const, depth: 0 },
      { path: "src", name: "src", type: "folder" as const, depth: 0 },
    ]

    const flat = flattenBackendTree(rawNodes)
    expect(flat.map((f) => f.name)).toEqual([
      "docs",
      "src",
      "apple.txt",
      "zebra.txt",
    ])
  })

  it("manages workspaceEpoch and canonical buffer lifecycle with status", () => {
    const editorCreator = createEditorSlice as any
    const workspaceCreator = createWorkspaceSlice as any
    const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
      ...editorCreator(set, get, store),
      ...workspaceCreator(set, get, store),
    }))

    const store = useTestStore.getState()
    expect(store.workspaceEpoch).toBe(0)

    // Simulate opening folder incrementing epoch
    useTestStore.setState((s) => ({ workspaceEpoch: s.workspaceEpoch + 1 }))
    expect(useTestStore.getState().workspaceEpoch).toBe(1)

    // Register idle buffer for JIT tab
    useTestStore.setState((s) => ({
      fileBuffers: {
        ...s.fileBuffers,
        "src/App.tsx": {
          content: "",
          savedContent: "",
          isDirty: false,
          language: "typescript",
          status: "idle",
        },
      },
    }))
    expect(useTestStore.getState().fileBuffers["src/App.tsx"]?.status).toBe(
      "idle",
    )

    // Update to loading
    useTestStore.setState((s) => ({
      fileBuffers: {
        ...s.fileBuffers,
        "src/App.tsx": {
          ...s.fileBuffers["src/App.tsx"]!,
          status: "loading",
        },
      },
    }))
    expect(useTestStore.getState().fileBuffers["src/App.tsx"]?.status).toBe(
      "loading",
    )

    // Transition to ready with canonical content
    useTestStore.setState((s) => ({
      fileBuffers: {
        ...s.fileBuffers,
        "src/App.tsx": {
          content: "export const App = () => null",
          savedContent: "export const App = () => null",
          isDirty: false,
          language: "typescript",
          status: "ready",
        },
      },
    }))
    expect(useTestStore.getState().fileBuffers["src/App.tsx"]?.status).toBe(
      "ready",
    )
    expect(useTestStore.getState().fileBuffers["src/App.tsx"]?.content).toBe(
      "export const App = () => null",
    )
    // Ensure no duplicate basename keys polluted the store
    expect(useTestStore.getState().fileBuffers["App.tsx"]).toBeUndefined()
  })

  it("persists pinned tabs and excludes them when closing tabs", () => {
    const storageMap = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    }
    vi.stubGlobal("window", { localStorage: mockStorage })

    saveStoredPinnedTabs(new Set(["pinned.ts"]))
    const loaded = loadStoredPinnedTabs()
    expect(loaded.has("pinned.ts")).toBe(true)

    const editorCreator = createEditorSlice as any
    const workspaceCreator = createWorkspaceSlice as any
    const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
      ...editorCreator(set, get, store),
      ...workspaceCreator(set, get, store),
    }))

    const store = useTestStore.getState()
    store.openFileInGroup("file1.ts")
    store.openFileInGroup("pinned.ts")
    store.openFileInGroup("file2.ts")
    expect(useTestStore.getState().group1.tabs).toEqual([
      "file1.ts",
      "pinned.ts",
      "file2.ts",
    ])

    // Ensure pinned.ts is marked pinned
    if (!useTestStore.getState().pinnedTabs.has("pinned.ts")) {
      store.togglePinTab("pinned.ts")
    }
    expect(useTestStore.getState().pinnedTabs.has("pinned.ts")).toBe(true)

    // closeAllTabs should keep pinned.ts and close file1.ts and file2.ts
    store.closeAllTabs()
    expect(useTestStore.getState().group1.tabs).toEqual(["pinned.ts"])
    expect(useTestStore.getState().activeTab).toBe("pinned.ts")

    // Unpin pinned.ts
    store.togglePinTab("pinned.ts")
    expect(useTestStore.getState().pinnedTabs.has("pinned.ts")).toBe(false)
    store.closeAllTabs()
    expect(useTestStore.getState().group1.tabs).toEqual([])
    vi.unstubAllGlobals()
  })
})

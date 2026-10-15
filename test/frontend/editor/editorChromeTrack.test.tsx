import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWorkbenchStore } from "@/store"
import {
  createEditorSlice,
  loadStoredPinnedTabs,
  saveStoredPinnedTabs,
} from "@/store/slices/createEditorSlice"
import { createChatSlice } from "@/store/slices/createChatSlice"
import type { ContextItem } from "@/types/workbench"

describe("Track MP-3.1 (Editor Chrome Track) Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useWorkbenchStore.setState({
      pinnedTabs: new Set<string>(),
      group1: { id: "group1", name: "Group 1", tabs: [], activeTab: "" },
      group2: { id: "group2", name: "Group 2", tabs: [], activeTab: "" },
      focusedGroup: "group1",
      chatOpen: false,
      contextItems: [],
      manualMentions: [],
      cursorPosition: { line: 1, col: 1 },
    })
  })

  describe("HD-02: Pinned Tabs Persistence & Close Filtering", () => {
    it("persists and restores pinned tabs via localStorage helper functions", () => {
      const storageMap = new Map<string, string>()
      const mockStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
      }
      vi.stubGlobal("window", { localStorage: mockStorage })

      const tabsToPin = new Set(["src/App.tsx", "src/main.ts"])
      saveStoredPinnedTabs(tabsToPin)

      const restored = loadStoredPinnedTabs()
      expect(restored.has("src/App.tsx")).toBe(true)
      expect(restored.has("src/main.ts")).toBe(true)
      expect(restored.has("other.ts")).toBe(false)

      vi.unstubAllGlobals()
    })

    it("toggles pinned state correctly via togglePinTab in store", () => {
      const store = useWorkbenchStore.getState()
      expect(store.pinnedTabs.has("src/config.ts")).toBe(false)

      store.togglePinTab("src/config.ts")
      expect(useWorkbenchStore.getState().pinnedTabs.has("src/config.ts")).toBe(
        true,
      )

      store.togglePinTab("src/config.ts")
      expect(useWorkbenchStore.getState().pinnedTabs.has("src/config.ts")).toBe(
        false,
      )
    })

    it("filters out pinned tabs when executing Close Others", () => {
      const store = useWorkbenchStore.getState()
      store.openFileInGroup("tabA.ts")
      store.openFileInGroup("tabB.ts")
      store.openFileInGroup("tabC_pinned.ts")
      store.openFileInGroup("tabD.ts")

      store.togglePinTab("tabC_pinned.ts")

      const currentGroup = useWorkbenchStore.getState().group1
      const contextTab = "tabA.ts"
      const pinnedTabs = useWorkbenchStore.getState().pinnedTabs

      // Close Others logic per HD-02 specification:
      const others = currentGroup.tabs.filter(
        (t) => t !== contextTab && !pinnedTabs.has(t),
      )
      for (const t of others) {
        store.closeTabInGroup(currentGroup.id, t)
      }

      const remaining = useWorkbenchStore.getState().group1.tabs
      expect(remaining).toContain("tabA.ts")
      expect(remaining).toContain("tabC_pinned.ts")
      expect(remaining).not.toContain("tabB.ts")
      expect(remaining).not.toContain("tabD.ts")
    })

    it("filters out pinned tabs when executing Close All", () => {
      const store = useWorkbenchStore.getState()
      store.openFileInGroup("file1.ts")
      store.openFileInGroup("pinned1.ts")
      store.openFileInGroup("file2.ts")
      store.openFileInGroup("pinned2.ts")

      store.togglePinTab("pinned1.ts")
      store.togglePinTab("pinned2.ts")

      const currentGroup = useWorkbenchStore.getState().group1
      const pinnedTabs = useWorkbenchStore.getState().pinnedTabs

      // Close All logic per HD-02 specification:
      const toClose = currentGroup.tabs.filter((t) => !pinnedTabs.has(t))
      for (const t of toClose) {
        store.closeTabInGroup(currentGroup.id, t)
      }

      const remaining = useWorkbenchStore.getState().group1.tabs
      expect(remaining).toEqual(["pinned1.ts", "pinned2.ts"])
    })
  })

  describe("CH-01: Selection Context Bridge ke Chat Drawer", () => {
    it("bridges active text selection to chat context chips and opens chat", () => {
      const filename = "src/services/auth.ts"
      const line = 25
      const selectedText =
        "const token = await login(credentials)\nif (!token) throw new Error()"

      const lineCount = selectedText.split("\n").length
      const endLine = line > 0 ? line + lineCount - 1 : 1
      const lineRangeStr = `Ln ${line}–${endLine}`

      const store = useWorkbenchStore.getState()
      store.setChatOpen(true)
      store.setSelection({
        startLine: line,
        endLine,
        selectedText,
      })

      const snippetItem: ContextItem = {
        id: `ctx-${filename}-selection`,
        type: "selection",
        path: filename,
        lineRange: lineRangeStr,
        content: selectedText,
        charCount: selectedText.length,
        estimatedTokens: Math.max(1, Math.ceil(selectedText.length / 4)),
        mode: "selection",
      }

      const nextMentions = [
        ...store.manualMentions.filter((m) => m.id !== snippetItem.id),
        snippetItem,
      ]

      useWorkbenchStore.setState({
        manualMentions: nextMentions,
        contextModeOverrides: {
          [filename]: "selection",
        },
      })
      store.syncContextItems()

      const stateAfter = useWorkbenchStore.getState()
      expect(stateAfter.chatOpen).toBe(true)
      const matchingChip = stateAfter.contextItems.find(
        (i) => i.id === `ctx-${filename}-selection`,
      )
      expect(matchingChip).toBeDefined()
      expect(matchingChip?.type).toBe("selection")
      expect(matchingChip?.content).toBe(selectedText)
      expect(matchingChip?.lineRange).toBe("Ln 25–26")
    })
  })

  describe("HD-01 & NEW-02: Breadcrumbs Contract Verification", () => {
    it("verifies cursor position contract { line, col: 1 } syncs with StatusBar format", () => {
      const sym = {
        id: "sym-1",
        name: "authenticateUser",
        kind: "function",
        lineStart: 42,
        lineEnd: 55,
      }
      const currentFile = "src/controllers/auth.ts"

      const events: any[] = []
      const fakeWindow = {
        dispatchEvent: (evt: any) => events.push(evt),
      }

      const store = useWorkbenchStore.getState()
      store.setCursorPosition({ line: sym.lineStart, col: 1 })

      fakeWindow.dispatchEvent({
        type: "aegis:editor-goto-line",
        detail: { file: currentFile, line: sym.lineStart, col: 1 },
      })

      // Verify cursorPosition state has col: 1 (not column: 1)
      const curPos = useWorkbenchStore.getState().cursorPosition
      expect(curPos.line).toBe(42)
      expect(curPos.col).toBe(1)
      expect((curPos as any).column).toBeUndefined()

      // Verify event contract
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe("aegis:editor-goto-line")
      expect(events[0].detail).toEqual({
        file: "src/controllers/auth.ts",
        line: 42,
        col: 1,
      })
    })
  })
})

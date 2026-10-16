import { describe, it, expect, vi, beforeEach } from "vitest"
import { create } from "zustand"
import {
  createWorkspaceSlice,
  markBufferSavedLogic,
  updateBufferContentLogic,
  updateDirtyFilesLogic,
  normalizeWorkspacePath,
} from "@/store/slices/createWorkspaceSlice"
import { createEditorSlice } from "@/store/slices/createEditorSlice"
import { handleWorkspaceChangeEvent } from "@/context/WorkbenchLifecycle"
import { useWorkbenchStore } from "@/store"
import * as workspaceApi from "@/utils/workspaceApi"
import type { WorkbenchStore } from "@/store/types"

describe("MP-5.3 Buffer Lifecycle Integrity & Concurrency Race Guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("OPT-BUF-01: In-Flight Save Race Condition", () => {
    it("preserves isDirty = true if buffer content was edited during in-flight network save", () => {
      let buffers = {
        "file.ts": {
          content: "initial edit",
          savedContent: "original",
          isDirty: true,
          language: "typescript",
        },
      }

      const contentSentToDisk = "initial edit"

      // User continues typing while save is in flight!
      buffers = updateBufferContentLogic(
        buffers,
        "file.ts",
        "initial edit + extra keystrokes",
      )

      // Network save finishes, returning contentSentToDisk
      const saved = markBufferSavedLogic(buffers, "file.ts", contentSentToDisk)

      expect(saved["file.ts"].savedContent).toBe("initial edit")
      expect(saved["file.ts"].content).toBe("initial edit + extra keystrokes")
      expect(saved["file.ts"].isDirty).toBe(true) // Crucial: NOT falsely marked clean!
      expect(typeof saved["file.ts"].lastSaved).toBe("number")
    })

    it("marks isDirty = false when buffer content matches contentToSave", () => {
      const buffers = {
        "file.ts": {
          content: "saved text",
          savedContent: "old text",
          isDirty: true,
          language: "typescript",
        },
      }

      const saved = markBufferSavedLogic(buffers, "file.ts", "saved text")
      expect(saved["file.ts"].savedContent).toBe("saved text")
      expect(saved["file.ts"].isDirty).toBe(false)
      expect(typeof saved["file.ts"].lastSaved).toBe("number")
    })

    it("saveFile preserves in-flight edits when network request takes time", async () => {
      let resolveSave: () => void = () => {}
      vi.spyOn(workspaceApi, "saveWorkspaceFile").mockImplementation(
        () =>
          new Promise<any>((resolve) => {
            resolveSave = () => resolve({ status: "ok" })
          }),
      )

      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      const store = useTestStore.getState()
      useTestStore.setState({
        fileBuffers: {
          "doc.txt": {
            content: "version 1",
            savedContent: "version 0",
            isDirty: true,
            language: "plaintext",
          },
        },
      })

      // Start saving version 1
      const savePromise = useTestStore.getState().saveFile("doc.txt")

      // User continues typing version 2 while save is in flight
      useTestStore
        .getState()
        .updateFileContent("doc.txt", "version 1 + keystroke")

      // Complete async save
      resolveSave()
      await savePromise

      const finalBuf = useTestStore.getState().fileBuffers["doc.txt"]
      expect(finalBuf.content).toBe("version 1 + keystroke")
      expect(finalBuf.savedContent).toBe("version 1")
      expect(finalBuf.isDirty).toBe(true)
      expect(finalBuf.lastSaved).toBeDefined()
    })
  })

  describe("OPT-BUF-02: Self-Save Watcher Echo Suppression", () => {
    it("records lastSaved on buffer upon saving", async () => {
      vi.spyOn(workspaceApi, "saveWorkspaceFile").mockResolvedValue({
        status: "ok",
      } as any)

      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        fileBuffers: {
          "app.ts": {
            content: "const a = 1",
            savedContent: "",
            isDirty: true,
            language: "typescript",
          },
        },
      })

      const before = Date.now()
      await useTestStore.getState().saveFile("app.ts")
      const after = Date.now()

      const buf = useTestStore.getState().fileBuffers["app.ts"]
      expect(buf.lastSaved).toBeDefined()
      expect(buf.lastSaved!).toBeGreaterThanOrEqual(before)
      expect(buf.lastSaved!).toBeLessThanOrEqual(after)
    })

    it("suppresses watcher reload if disk event arrives within 800ms of lastSaved", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(undefined)
      useWorkbenchStore.setState({
        rootWorkspacePath: "/workspace",
        fetchBufferSafely: fetchSpy,
        fileBuffers: {
          "src/app.ts": {
            content: "code",
            savedContent: "code",
            isDirty: false,
            language: "typescript",
            lastSaved: Date.now() - 100, // 100ms ago (< 800ms)
          },
        },
      })

      await handleWorkspaceChangeEvent(
        {
          created: [],
          modified: ["/workspace/src/app.ts"],
          deleted: [],
        },
        useWorkbenchStore,
      )

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("suppresses reload if disk content matches buf.savedContent after 800ms", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(undefined)
      vi.spyOn(workspaceApi, "fetchFileDetailed").mockResolvedValue({
        content: "exact saved content",
        size: 19,
        isLarge: false,
        isBinary: false,
      } as any)

      useWorkbenchStore.setState({
        rootWorkspacePath: "/workspace",
        fetchBufferSafely: fetchSpy,
        fileBuffers: {
          "src/app.ts": {
            content: "exact saved content",
            savedContent: "exact saved content",
            isDirty: false,
            language: "typescript",
            lastSaved: Date.now() - 1000, // 1000ms ago (> 800ms)
          },
        },
      })

      await handleWorkspaceChangeEvent(
        {
          created: [],
          modified: ["/workspace/src/app.ts"],
          deleted: [],
        },
        useWorkbenchStore,
      )

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("does not flag hasDiskConflict if dirty buffer matches disk content", async () => {
      vi.spyOn(workspaceApi, "fetchFileDetailed").mockResolvedValue({
        content: "my-saved-version",
        size: 16,
        isLarge: false,
        isBinary: false,
      } as any)

      useWorkbenchStore.setState({
        rootWorkspacePath: "/workspace",
        fileBuffers: {
          "src/app.ts": {
            content: "dirty-edits",
            savedContent: "my-saved-version",
            isDirty: true,
            language: "typescript",
            hasDiskConflict: false,
            lastSaved: Date.now() - 2000, // 2s ago
          },
        },
      })

      await handleWorkspaceChangeEvent(
        {
          created: [],
          modified: ["src/app.ts"],
          deleted: [],
        },
        useWorkbenchStore,
      )

      expect(
        useWorkbenchStore.getState().fileBuffers["src/app.ts"]?.hasDiskConflict,
      ).toBe(false)
    })

    it("flags hasDiskConflict when dirty buffer encounters external modification", async () => {
      vi.spyOn(workspaceApi, "fetchFileDetailed").mockResolvedValue({
        content: "external-edit",
        size: 13,
        isLarge: false,
        isBinary: false,
      } as any)

      useWorkbenchStore.setState({
        rootWorkspacePath: "/workspace",
        showToast: vi.fn(),
        fileBuffers: {
          "src/app.ts": {
            content: "my-unsaved-typing",
            savedContent: "old-version",
            isDirty: true,
            language: "typescript",
            hasDiskConflict: false,
            lastSaved: Date.now() - 2000,
          },
        },
      })

      await handleWorkspaceChangeEvent(
        {
          created: [],
          modified: ["src/app.ts"],
          deleted: [],
        },
        useWorkbenchStore,
      )

      expect(
        useWorkbenchStore.getState().fileBuffers["src/app.ts"]?.hasDiskConflict,
      ).toBe(true)
    })
  })

  describe("OPT-BUF-03: Canonical Tab Paths on Close", () => {
    it("prompts confirmCloseFile when closing dirty buffer with unnormalized tab path", () => {
      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        rootWorkspacePath: "/home/user/project",
        fileBuffers: {
          "src/index.ts": {
            content: "dirty content",
            savedContent: "clean",
            isDirty: true,
            language: "typescript",
          },
        },
        group1: {
          id: "group1",
          name: "G1",
          tabs: ["/home/user/project/src/index.ts"],
          activeTab: "/home/user/project/src/index.ts",
        },
      })

      // Try closing with full unnormalized path
      useTestStore
        .getState()
        .closeTabInGroup("group1", "/home/user/project/src/index.ts")

      // It must prompt confirmation rather than silently closing!
      expect(useTestStore.getState().confirmCloseFile).toEqual({
        group: "group1",
        filename: "/home/user/project/src/index.ts",
      })
      expect(useTestStore.getState().group1.tabs).toContain(
        "/home/user/project/src/index.ts",
      )
    })

    it("prompts confirmCloseFile on closeAllTabs when unnormalized tab path is dirty", () => {
      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        rootWorkspacePath: "/repo",
        fileBuffers: {
          "test.ts": {
            content: "changes",
            savedContent: "",
            isDirty: true,
            language: "typescript",
          },
        },
        group1: {
          id: "group1",
          name: "G1",
          tabs: ["/repo/test.ts"],
          activeTab: "/repo/test.ts",
        },
      })

      useTestStore.getState().closeAllTabs()

      expect(useTestStore.getState().confirmCloseFile).toEqual({
        group: "group1",
        filename: "/repo/test.ts",
      })
    })
  })

  describe("OPT-BUF-04: Auto-Save State Sync", () => {
    it("clears isDirty and updates savedContent on autoSaveDirtyBuffers", async () => {
      const savedFiles: Record<string, string> = {}
      vi.spyOn(workspaceApi, "saveWorkspaceFile").mockImplementation(
        async (file, content) => {
          savedFiles[file] = content
          return { status: "ok" } as any
        },
      )

      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        fileBuffers: {
          "file1.ts": {
            content: "content 1",
            savedContent: "initial 1",
            isDirty: true,
            language: "typescript",
          },
          "file2.ts": {
            content: "content 2",
            savedContent: "initial 2",
            isDirty: true,
            language: "typescript",
          },
          "file3.ts": {
            content: "content 3",
            savedContent: "content 3",
            isDirty: false,
            language: "typescript",
          },
        },
      })

      await useTestStore.getState().autoSaveDirtyBuffers()

      expect(savedFiles["file1.ts"]).toBe("content 1")
      expect(savedFiles["file2.ts"]).toBe("content 2")
      expect(savedFiles["file3.ts"]).toBeUndefined()

      const finalBuffers = useTestStore.getState().fileBuffers
      expect(finalBuffers["file1.ts"].isDirty).toBe(false)
      expect(finalBuffers["file1.ts"].savedContent).toBe("content 1")
      expect(finalBuffers["file2.ts"].isDirty).toBe(false)
      expect(finalBuffers["file2.ts"].savedContent).toBe("content 2")
      expect(finalBuffers["file3.ts"].isDirty).toBe(false)
    })
  })

  describe("OPT-BUF-05: Per-File Async Sequence Guard", () => {
    it("discards stale out-of-order fetch responses for the same file", async () => {
      let resolveFirstFetch: (detail: any) => void = () => {}
      let resolveSecondFetch: (detail: any) => void = () => {}

      let callCount = 0
      vi.spyOn(workspaceApi, "fetchFileDetailed").mockImplementation(
        () =>
          new Promise<any>((resolve) => {
            callCount++
            if (callCount === 1) {
              resolveFirstFetch = resolve
            } else {
              resolveSecondFetch = resolve
            }
          }),
      )

      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        rootWorkspacePath: "/test-root",
        files: [
          {
            depth: 0,
            icon: "file",
            label: "target.ts",
            path: "target.ts",
            name: "target.ts",
            type: "file",
          },
        ],
        fileBuffers: {},
      })

      // Start fetch #1
      const fetch1Promise = useTestStore
        .getState()
        .fetchBufferSafely("target.ts")

      // Rapidly start fetch #2 before fetch #1 completes
      const fetch2Promise = useTestStore
        .getState()
        .fetchBufferSafely("target.ts")

      // Fetch #2 resolves first with newer content "v2"
      resolveSecondFetch({
        content: "v2-content",
        size: 10,
        isLarge: false,
        isBinary: false,
      })
      await fetch2Promise

      expect(useTestStore.getState().fileBuffers["target.ts"]?.content).toBe(
        "v2-content",
      )

      // Fetch #1 now resolves later with stale content "v1"
      resolveFirstFetch({
        content: "v1-stale-content",
        size: 16,
        isLarge: false,
        isBinary: false,
      })
      await fetch1Promise

      // Stale response must be discarded by fileFetchTokens guard!
      expect(useTestStore.getState().fileBuffers["target.ts"]?.content).toBe(
        "v2-content",
      )
    })
  })

  describe("OPT-DIRTY-01: Decoupled Dirty Files Map & Reference Stability", () => {
    it("updateDirtyFilesLogic preserves reference when status remains dirty", () => {
      const initialDirty = { "a.ts": true }
      const nextDirty = updateDirtyFilesLogic(initialDirty, "a.ts", true)
      expect(Object.is(initialDirty, nextDirty)).toBe(true)
    })

    it("updateDirtyFilesLogic creates new reference when transitioning from clean to dirty", () => {
      const initialDirty = {}
      const nextDirty = updateDirtyFilesLogic(initialDirty, "a.ts", true)
      expect(nextDirty["a.ts"]).toBe(true)
      expect(Object.is(initialDirty, nextDirty)).toBe(false)
    })

    it("updateDirtyFilesLogic creates new reference and deletes key when transitioning from dirty to clean", () => {
      const initialDirty = { "a.ts": true, "b.ts": true }
      const nextDirty = updateDirtyFilesLogic(initialDirty, "a.ts", false)
      expect(nextDirty["a.ts"]).toBeUndefined()
      expect(nextDirty["b.ts"]).toBe(true)
      expect(Object.is(initialDirty, nextDirty)).toBe(false)
    })

    it("store preserves dirtyFiles reference identity across repeated keystrokes on dirty buffer", async () => {
      const editorCreator = createEditorSlice as any
      const workspaceCreator = createWorkspaceSlice as any
      const useTestStore = create<WorkbenchStore>()((set, get, store) => ({
        ...editorCreator(set, get, store),
        ...workspaceCreator(set, get, store),
      }))

      useTestStore.setState({
        fileBuffers: {
          "code.ts": {
            content: "function test() {}",
            savedContent: "function test() {}",
            isDirty: false,
            language: "typescript",
          },
        },
        dirtyFiles: {},
      })

      // 1st keystroke: clean -> dirty (dirtyFiles reference MUST change)
      useTestStore
        .getState()
        .updateFileContent("code.ts", "function test() { a")
      const dirty1 = useTestStore.getState().dirtyFiles
      expect(dirty1["code.ts"]).toBe(true)

      // 2nd keystroke: dirty -> dirty (dirtyFiles reference MUST be preserved!)
      useTestStore
        .getState()
        .updateFileContent("code.ts", "function test() { ab")
      const dirty2 = useTestStore.getState().dirtyFiles
      expect(dirty2["code.ts"]).toBe(true)
      expect(Object.is(dirty1, dirty2)).toBe(true)

      // 3rd keystroke: dirty -> dirty (dirtyFiles reference MUST be preserved!)
      useTestStore
        .getState()
        .updateFileContent("code.ts", "function test() { abc")
      const dirty3 = useTestStore.getState().dirtyFiles
      expect(dirty3["code.ts"]).toBe(true)
      expect(Object.is(dirty2, dirty3)).toBe(true)

      // Revert: dirty -> clean
      useTestStore.getState().revertBufferContent("code.ts")
      const dirtyReverted = useTestStore.getState().dirtyFiles
      expect(dirtyReverted["code.ts"]).toBeFalsy()
      expect(Object.is(dirty3, dirtyReverted)).toBe(false)
    })
  })
})

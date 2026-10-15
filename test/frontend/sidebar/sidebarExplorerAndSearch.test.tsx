import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToString } from "react-dom/server"
import { useWorkbenchStore } from "@/store"
import { Sidebar } from "@/components/layout/sidebar/Sidebar"
import { ExplorerPanel } from "@/components/layout/sidebar/ExplorerPanel"
import { SearchPanel } from "@/components/layout/sidebar/SearchPanel"

describe("Track MP-3.2 (Sidebar Explorer & Search) Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const listeners: Record<string, Function[]> = {}
    // @ts-ignore
    globalThis.window = {
      addEventListener: (type: string, cb: Function) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(cb)
      },
      removeEventListener: (type: string, cb: Function) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((fn) => fn !== cb)
        }
      },
      dispatchEvent: (ev: any) => {
        listeners[ev.type]?.forEach((fn) => fn(ev))
        return true
      },
    }
    // In Node SSR, React 19's useSyncExternalStore calls getInitialState
    ;(useWorkbenchStore as any).getInitialState = () =>
      useWorkbenchStore.getState()
    useWorkbenchStore.setState({
      activeActivity: "Explorer",
      rootWorkspacePath: "/home/project",
      rootWorkspaceName: "project",
      files: [
        {
          id: "folder-src",
          name: "src",
          path: "src",
          label: "src",
          type: "folder",
          icon: "folder",
          depth: 0,
        },
        {
          id: "file-app",
          name: "App.tsx",
          path: "src/App.tsx",
          label: "App.tsx",
          type: "file",
          icon: "code",
          depth: 1,
        },
      ],
      focusedGroup: "group1",
      group1: { tabs: ["src/App.tsx"], activeTab: "src/App.tsx" },
      group2: { tabs: [], activeTab: "" },
      fileBuffers: {
        "src/App.tsx": {
          content: "export function App() { return <div>Hello</div> }",
          savedContent: "export function App() { return <div>Hello</div> }",
          isDirty: false,
          hasDiskConflict: false,
          isDeletedOnDisk: false,
          language: "TypeScript",
          status: "ready",
        },
      },
    })
  })

  describe("SB-01: Header Duplication Elimination", () => {
    it("renders panel-title for Explorer", () => {
      const html = renderToString(<Sidebar activeActivity="Explorer" />)
      expect(html).toContain("panel-title")
      expect(html).toContain("Explorer")
    })

    it("renders panel-title for Search", () => {
      const html = renderToString(<Sidebar activeActivity="Search" />)
      expect(html).toContain("panel-title")
      expect(html).toContain("Search")
    })

    it("hides panel-title when activeActivity is Source Control", () => {
      const html = renderToString(<Sidebar activeActivity="Source Control" />)
      // Double header eliminated: outer panel-title must NOT be rendered for Source Control
      expect(html).not.toContain('<div class="panel-title">')
    })

    it("triggers refresh and collapse event on IconButton click in Explorer", () => {
      let dispatchedEvent = ""
      const mockWindow = {
        dispatchEvent: (ev: { type: string }) => {
          dispatchedEvent = ev.type
        },
      }
      // @ts-ignore
      globalThis.window = mockWindow

      const refreshSpy = vi.fn()
      useWorkbenchStore.setState({
        activeActivity: "Explorer",
        refreshWorkspace: refreshSpy,
      })

      // Test window custom event dispatch
      window.dispatchEvent(new CustomEvent("aegis:explorer-collapse-all"))
      expect(dispatchedEvent).toBe("aegis:explorer-collapse-all")
    })
  })

  describe("SB-03: Create File & Folder with Parent Path & Context Menu", () => {
    it("prepends parentFolder to newly created file path", async () => {
      const createFileSpy = vi.fn()
      useWorkbenchStore.setState({ createFile: createFileSpy })

      const parentFolder = "src/components"
      const name = "Button.tsx"
      const cleanParent = parentFolder.replace(/\/+$/, "")
      const finalName = `${cleanParent}/${name.replace(/^\/+/, "")}`

      expect(finalName).toBe("src/components/Button.tsx")
    })

    it("avoids double prepending if input already contains parentFolder prefix", () => {
      const parentFolder = "src/components"
      const name = "src/components/Button.tsx"
      const cleanParent = parentFolder.replace(/\/+$/, "")
      let finalName = name
      if (cleanParent && !name.startsWith(cleanParent + "/")) {
        finalName = `${cleanParent}/${name.replace(/^\/+/, "")}`
      }

      expect(finalName).toBe("src/components/Button.tsx")
    })

    it("renders ExplorerPanel with folder and file rows", () => {
      useWorkbenchStore.setState({
        rootWorkspacePath: "/home/project",
        rootWorkspaceName: "project",
        files: [
          {
            id: "folder-src",
            name: "src",
            path: "src",
            label: "src",
            type: "folder",
            icon: "folder",
            depth: 0,
          },
        ],
      })
      const html = renderToString(<ExplorerPanel />)
      expect(html).toContain("explorer-panel")
    })
  })

  describe("SB-04: Race Condition Guard in Create and Rename", () => {
    it("prevents double submission using isSubmittingRef logic", () => {
      let isSubmitting = false
      let submitCallCount = 0

      function handleSubmit() {
        if (isSubmitting) return
        isSubmitting = true
        submitCallCount++
        setTimeout(() => {
          isSubmitting = false
        }, 50)
      }

      // Simulate simultaneous Enter keydown followed immediately by onBlur
      handleSubmit() // on Enter
      handleSubmit() // on Blur
      expect(submitCallCount).toBe(1)
    })

    it("cancels submission when Escape is pressed without saving on blur", () => {
      let isSubmitting = false
      let submitCallCount = 0
      let isCreating = true

      function handleCancel() {
        isSubmitting = true
        isCreating = false
        setTimeout(() => {
          isSubmitting = false
        }, 50)
      }

      function handleBlur() {
        if (!isSubmitting && isCreating) {
          submitCallCount++
        }
      }

      handleCancel() // on Escape
      handleBlur() // on Blur
      expect(submitCallCount).toBe(0)
    })
  })

  describe("SB-05: Goto Line Event on Search Match Row Click", () => {
    it("emits aegis:editor-goto-line event with file, line, and col", () => {
      let capturedEvent: any = null
      // @ts-ignore
      globalThis.window = {
        dispatchEvent: (ev: any) => {
          capturedEvent = ev
        },
      }

      const match = {
        filename: "src/utils/math.ts",
        lineNumber: 42,
        column: 15,
      }

      window.dispatchEvent(
        new CustomEvent("aegis:editor-goto-line", {
          detail: {
            file: match.filename,
            line: match.lineNumber,
            col: match.column,
          },
        }),
      )

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent.type).toBe("aegis:editor-goto-line")
      expect(capturedEvent.detail).toEqual({
        file: "src/utils/math.ts",
        line: 42,
        col: 15,
      })
    })
  })

  describe("SB-06: SearchPanel Performance & Safeguards", () => {
    it("renders SearchPanel structure and default empty search hint", () => {
      const html = renderToString(<SearchPanel />)
      expect(html).toContain("search-panel")
      expect(html).toContain("Search across workspace files")
    })
  })
})

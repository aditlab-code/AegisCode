import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { useWorkbenchStore } from "../../../src/store"
import CsvViewer from "../../../src/components/layout/editor/viewers/CsvViewer"
import { CodePane } from "../../../src/components/layout/editor/CodePane"
import { Minimap } from "../../../src/components/layout/editor/Minimap"

describe("Phase 7: Residual Edge Cases Remediation Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(React, "useSyncExternalStore").mockImplementation(
      (_subscribe: any, getSnapshot: any) => getSnapshot(),
    )
    useWorkbenchStore.setState({
      fileBuffers: {},
      dirtyFiles: {},
      group1: { id: "group1", name: "Group 1", tabs: [], activeTab: "" },
      group2: { id: "group2", name: "Group 2", tabs: [], activeTab: "" },
      focusedGroup: "group1",
      activeTab: "",
    })
  })

  describe("MAL-02: CsvViewer Empty Buffer Handling", () => {
    it("handles 0-byte empty CSV buffer without entering infinite network fetch loop", () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal("fetch", fetchSpy)

      useWorkbenchStore.setState({
        fileBuffers: {
          "data.csv": {
            content: "",
            savedContent: "",
            isDirty: false,
            language: "csv",
            status: "ready",
          },
        },
      })

      const html = renderToString(
        React.createElement(CsvViewer, {
          filename: "data.csv",
          groupId: "group1",
        }),
      )

      expect(html).toBeDefined()
      // Verification: fetch should NOT be called since buffer.content is string ("")
      expect(fetchSpy).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })
  })

  describe("MAL-04: CodePane Error Buffer Feedback & Retry Action", () => {
    it("renders informative error card and retry button when buffer.status is 'error'", () => {
      useWorkbenchStore.setState({
        fileBuffers: {
          "broken.ts": {
            content: "",
            savedContent: "",
            isDirty: false,
            language: "typescript",
            status: "error",
          },
        },
      })

      const html = renderToString(
        React.createElement(CodePane, {
          paneId: "primary",
          filename: "broken.ts",
          isFocused: true,
        }),
      )

      expect(html).toContain("Failed to load file")
      expect(html).toContain("broken.ts")
      expect(html).toContain("Retry Loading")
    })

    it("renders loading spinner when buffer.status is 'loading'", () => {
      useWorkbenchStore.setState({
        fileBuffers: {
          "loading.ts": {
            content: "",
            savedContent: "",
            isDirty: false,
            language: "typescript",
            status: "loading",
          },
        },
      })

      const html = renderToString(
        React.createElement(CodePane, {
          paneId: "primary",
          filename: "loading.ts",
          isFocused: true,
        }),
      )

      expect(html).toContain("Loading")
      expect(html).toContain("loading.ts")
      expect(html).not.toContain("Failed to load file")
    })
  })

  describe("Phase 8: Minimap Canvas Silhouette & Viewport Synchronization", () => {
    it("renders canvas element and slider without per-line DOM text nodes", () => {
      const sampleLines = [
        "import React from 'react'",
        "export function App() {",
        "  return <div>Hello</div>",
        "}",
      ]

      const html = renderToString(
        React.createElement(Minimap, {
          filename: "App.tsx",
          lines: sampleLines,
          scrollTop: 0,
          scrollHeight: 1000,
          clientHeight: 500,
          onScrollToLine: vi.fn(),
          scale: "medium",
        }),
      )

      // Should render canvas and slider
      expect(html).toContain("minimap-canvas")
      expect(html).toContain("minimap-slider")
      // Should NOT render old DOM line elements or text
      expect(html).not.toContain("minimap-line")
      expect(html).not.toContain("minimap-raw-text")
      expect(html).not.toContain("Hello</div>")
    })

    it("handles zero lines or empty file gracefully without crashing", () => {
      const html = renderToString(
        React.createElement(Minimap, {
          filename: "empty.ts",
          lines: [],
          scrollTop: 0,
          scrollHeight: 100,
          clientHeight: 100,
          onScrollToLine: vi.fn(),
          scale: "small",
        }),
      )

      expect(html).toContain("minimap-canvas")
      expect(html).toContain("minimap-slider")
    })
  })
})

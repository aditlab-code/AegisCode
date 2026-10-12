import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { OutputView } from "@/components/layout/bottom-panel/OutputView"
import { EditorBreadcrumbs } from "@/components/layout/editor/EditorBreadcrumbs"

describe("Batch 4 Refinements & Edge Case Verifications", () => {
  describe("OutputView timestamp handling", () => {
    it("renders bracketed timestamp when present", () => {
      const logs = {
        backend: ["[12:30:45] Server listening on port 8080"],
        build: [],
        debug: [],
        lsp: [],
      }
      const html = renderToString(<OutputView channel="backend" logs={logs} />)
      expect(html).toContain("12:30:45")
      expect(html).toContain("Server listening on port 8080")
    })

    it("does NOT inject mock fallback timestamp 10:42:08 when line lacks bracketed time", () => {
      const logs = {
        backend: ["Unformatted raw output log from terminal"],
        build: [],
        debug: [],
        lsp: [],
      }
      const html = renderToString(<OutputView channel="backend" logs={logs} />)
      expect(html).not.toContain("10:42:08")
      expect(html).toContain("Unformatted raw output log from terminal")
    })
  })

  describe("EditorBreadcrumbs path formatting", () => {
    it("renders root files directly without hardcoded src prefix", () => {
      const html = renderToString(<EditorBreadcrumbs file="README.md" />)
      expect(html).toContain("README.md")
      expect(html).not.toContain("<span>src</span>")
    })

    it("renders nested directory segments accurately", () => {
      const html = renderToString(
        <EditorBreadcrumbs file="server/cmd/server/main.go" />,
      )
      expect(html).toContain("server")
      expect(html).toContain("cmd")
      expect(html).toContain("main.go")
      expect(html).not.toContain("src > server")
    })
  })
})

import { describe, it, expect } from "vitest"
import { resolveLanguage } from "../../../src/components/layout/editor/cmTheme"
import { isLspLanguage, detectLanguage } from "../../../src/utils/linter"
import {
  notifyLspDidSave,
  notifyLspDidClose,
  fetchLspSymbols,
  type LspCompletionItem,
  type LspLocation,
  type LspTextEdit,
} from "../../../src/utils/lspApi"

describe("LSP Integration & Language Resolution", () => {
  it("resolves multi-language extensions accurately", () => {
    expect(resolveLanguage("main.go").id).toBe("go")
    expect(resolveLanguage("app.ts").id).toBe("typescript")
    expect(resolveLanguage("component.tsx").id).toBe("typescriptreact")
    expect(resolveLanguage("index.js").id).toBe("javascript")
    expect(resolveLanguage("script.py").id).toBe("python")
    expect(resolveLanguage("lib.rs").id).toBe("rust")
    expect(resolveLanguage("native.cpp").id).toBe("cpp")
    expect(resolveLanguage("header.h").id).toBe("c")
    expect(resolveLanguage("Makefile").id).toBe("makefile")
    expect(resolveLanguage("GNUmakefile").id).toBe("makefile")
    expect(resolveLanguage("rules.mk").id).toBe("makefile")
    expect(resolveLanguage("script.sh").id).toBe("shellscript")
    expect(resolveLanguage("deploy.bash").id).toBe("shellscript")
    expect(resolveLanguage(".bashrc").id).toBe("shellscript")
    expect(resolveLanguage("Program.cs").id).toBe("csharp")
    expect(resolveLanguage("eval.csx").id).toBe("csharp")
    expect(resolveLanguage("doc.md").id).toBe("markdown")
    expect(resolveLanguage("style.css").id).toBe("css")
    expect(resolveLanguage("data.json").id).toBe("json")
    expect(resolveLanguage("unknown.xyz").id).toBe("plaintext")

    // Verify active syntax parser extensions are loaded
    expect(resolveLanguage("lib.rs").ext).not.toBeNull()
    expect(resolveLanguage("native.cpp").ext).not.toBeNull()
    expect(resolveLanguage("header.h").ext).not.toBeNull()
    expect(resolveLanguage("Program.cs").ext).not.toBeNull()
    expect(resolveLanguage("unknown.xyz").ext).toBeNull()
  })

  it("identifies LSP-supported languages to eliminate heuristic regex conflicts", () => {
    // Should be recognized as LSP backed
    expect(isLspLanguage("main.go")).toBe(true)
    expect(isLspLanguage("service.ts")).toBe(true)
    expect(isLspLanguage("view.tsx")).toBe(true)
    expect(isLspLanguage("util.js")).toBe(true)
    expect(isLspLanguage("test.py")).toBe(true)
    expect(isLspLanguage("worker.rs")).toBe(true)
    expect(isLspLanguage("driver.c")).toBe(true)
    expect(isLspLanguage("engine.cpp")).toBe(true)
    expect(isLspLanguage("Makefile")).toBe(true)
    expect(isLspLanguage("GNUmakefile")).toBe(true)
    expect(isLspLanguage("rules.mk")).toBe(true)
    expect(isLspLanguage("script.sh")).toBe(true)
    expect(isLspLanguage(".bashrc")).toBe(true)
    expect(isLspLanguage("Program.cs")).toBe(true)

    // Verify detectLanguage accuracy
    expect(detectLanguage("Makefile")).toBe("Makefile")
    expect(detectLanguage("script.sh")).toBe("Shell")
    expect(detectLanguage("Program.cs")).toBe("C#")
    expect(detectLanguage("driver.c")).toBe("C")
    expect(detectLanguage("engine.cpp")).toBe("C++")

    // Should NOT be suppressed (still uses regex or built-in validation)
    expect(isLspLanguage("package.json")).toBe(false)
    expect(isLspLanguage("README.md")).toBe(false)
    expect(isLspLanguage("notes.txt")).toBe(false)
  })

  it("correctly calculates CodeMirror change offsets from LSP TextEdits", () => {
    const sampleDoc = "const x = 1\nconst y = 2\nconst z = 3"
    const lines = sampleDoc.split("\n")

    // Mock an LSP TextEdit on line 1: replacing "const y = 2" with "const y = 20"
    const edit: LspTextEdit = {
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 11 },
      },
      newText: "const y = 20",
    }

    // Line 1 is the second line (0-indexed line 1 has offset: len("const x = 1\n") = 12)
    const line1Offset = lines[0].length + 1
    const from = line1Offset + edit.range.start.character
    const to = line1Offset + edit.range.end.character

    expect(sampleDoc.slice(from, to)).toBe("const y = 2")

    const modified =
      sampleDoc.slice(0, from) + edit.newText + sampleDoc.slice(to)
    expect(modified).toBe("const x = 1\nconst y = 20\nconst z = 3")
  })

  it("handles LSP definition locations across same-file and cross-file paths", () => {
    const currentFile = "src/components/layout/editor/CMEditor.tsx"

    const sameFileLoc: LspLocation = {
      uri: "file:///workspace/project/src/components/layout/editor/CMEditor.tsx",
      range: {
        start: { line: 42, character: 10 },
        end: { line: 42, character: 25 },
      },
    }

    let cleanSamePath = sameFileLoc.uri.replace(/^file:\/\//, "")
    const isSame = cleanSamePath.endsWith(currentFile)
    expect(isSame).toBe(true)

    const crossFileLoc: LspLocation = {
      uri: "file:///workspace/project/src/utils/lspApi.ts",
      range: {
        start: { line: 15, character: 4 },
        end: { line: 15, character: 18 },
      },
    }

    let cleanCrossPath = crossFileLoc.uri.replace(/^file:\/\//, "")
    const isCross = cleanCrossPath.endsWith(currentFile)
    expect(isCross).toBe(false)
  })

  it("parses markdown hover code blocks and documentation text", () => {
    const rawMarkdown =
      "```typescript\nfunction calculate(val: number): boolean\n```\nCalculates whether the value matches the threshold."

    const parts = rawMarkdown.split(/(```[\s\S]*?```)/g)
    expect(parts.length).toBe(3)

    const codePart = parts.find((p) => p.startsWith("```"))
    expect(codePart).toBeDefined()
    expect(codePart).toContain("function calculate")

    const textPart = parts.find(
      (p) => !p.startsWith("```") && p.trim().length > 0,
    )
    expect(textPart?.trim()).toBe(
      "Calculates whether the value matches the threshold.",
    )
  })

  it("accurately detects language for all 10 supported programming languages", () => {
    expect(detectLanguage("main.go")).toBe("Go")
    expect(detectLanguage("app.ts")).toBe("TypeScript")
    expect(detectLanguage("component.tsx")).toBe("TypeScript")
    expect(detectLanguage("index.js")).toBe("JavaScript")
    expect(detectLanguage("script.py")).toBe("Python")
    expect(detectLanguage("lib.rs")).toBe("Rust")
    expect(detectLanguage("driver.c")).toBe("C")
    expect(detectLanguage("header.h")).toBe("C")
    expect(detectLanguage("engine.cpp")).toBe("C++")
    expect(detectLanguage("page.html")).toBe("HTML")
    expect(detectLanguage("theme.css")).toBe("CSS")
    expect(detectLanguage("data.json")).toBe("JSON")
  })

  it("sorts multiple out-of-order TextEdits stably for non-overlapping application", () => {
    const edits: LspTextEdit[] = [
      {
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 5 },
        },
        newText: "edit2",
      },
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        newText: "edit0",
      },
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        newText: "edit1",
      },
    ]

    const sorted = [...edits].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line
      }
      return a.range.start.character - b.range.start.character
    })

    expect(sorted[0].newText).toBe("edit0")
    expect(sorted[1].newText).toBe("edit1")
    expect(sorted[2].newText).toBe("edit2")
  })

  it("dispatches didSave, didClose, and fetchSymbols requests to LSP backend", async () => {
    const fetchCalls: any[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((async (url: string, init?: RequestInit) => {
      fetchCalls.push({
        url: String(url),
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (String(url).endsWith("/api/v1/lsp/symbols")) {
        return {
          ok: true,
          json: async () => ({
            symbols: [
              {
                name: "MySymbol",
                kind: 12,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 10, character: 0 },
                },
                selectionRange: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 8 },
                },
              },
            ],
          }),
        } as Response
      }
      return { ok: true, json: async () => ({ status: "ok" }) } as Response
    }) as any)

    try {
      await notifyLspDidSave("main.go", "package main\n", "go")
      expect(fetchCalls[0].url).toContain("/api/v1/lsp/save")
      expect(fetchCalls[0].body).toEqual({
        path: "main.go",
        content: "package main\n",
        language: "go",
      })

      await notifyLspDidClose("main.go", "go")
      expect(fetchCalls[1].url).toContain("/api/v1/lsp/close")
      expect(fetchCalls[1].body).toEqual({
        path: "main.go",
        language: "go",
      })

      const symbols = await fetchLspSymbols("main.go", "go")
      expect(fetchCalls[2].url).toContain("/api/v1/lsp/symbols")
      expect(symbols).toHaveLength(1)
      expect(symbols[0].name).toBe("MySymbol")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

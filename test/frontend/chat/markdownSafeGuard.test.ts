import { describe, it, expect, vi } from "vitest"
import {
  parseMarkdownBlocks,
  renderInlineMarkdown,
} from "@/components/layout/chat/MarkdownRenderer"

describe("MarkdownRenderer Safe Guard & Block Parser", () => {
  it("handles cleanly closed fenced code blocks", () => {
    const text = "```typescript\nconst a = 1\n```"
    const blocks = parseMarkdownBlocks(text, false)
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe("code")
    if (blocks[0].type === "code") {
      expect(blocks[0].lang).toBe("typescript")
      expect(blocks[0].content).toBe("const a = 1")
      expect(blocks[0].unclosed).toBe(false)
    }
  })

  it("safely handles unclosed code blocks when stream is interrupted without crashing", () => {
    const text =
      "Here is some code:\n```python\ndef run_query():\n    db.connect()"
    const blocks = parseMarkdownBlocks(text, false)
    expect(blocks.length).toBe(2)
    expect(blocks[0].type).toBe("p")
    expect(blocks[1].type).toBe("code")
    if (blocks[1].type === "code") {
      expect(blocks[1].lang).toBe("python")
      expect(blocks[1].content).toBe("def run_query():\n    db.connect()")
      expect(blocks[1].unclosed).toBe(true)
    }
  })

  it("extracts code block with target filepath notation", () => {
    const text = "```tsx:src/components/App.tsx\nexport function App() {}\n```"
    const blocks = parseMarkdownBlocks(text, false)
    expect(blocks.length).toBe(1)
    if (blocks[0].type === "code") {
      expect(blocks[0].lang).toBe("tsx")
      expect(blocks[0].targetPath).toBe("src/components/App.tsx")
      expect(blocks[0].content).toBe("export function App() {}")
      expect(blocks[0].unclosed).toBe(false)
    }
  })

  it("correctly parses headers, lists, and tables without bleeding across blocks", () => {
    const markdown = `# Title
## Subtitle
- Item 1
- Item 2
| Header 1 | Header 2 |
| --- | --- |
| Val 1 | Val 2 |`

    const blocks = parseMarkdownBlocks(markdown, false)
    expect(blocks.length).toBe(4)
    expect(blocks[0].type).toBe("header")
    expect(blocks[1].type).toBe("header")
    expect(blocks[2].type).toBe("ul")
    expect(blocks[3].type).toBe("table")
  })

  it("preserves leading whitespace before @mention pills and /commands", () => {
    const onOpenFile = vi.fn()
    const nodes = renderInlineMarkdown(
      "Open @src/app.tsx now and run /test suite",
      onOpenFile,
      "test-key",
    )

    // Verify whitespace is preserved between preceding words and pills/chips
    expect(nodes.length).toBeGreaterThanOrEqual(4)
    expect(nodes[0]).toBe("Open")
    expect(nodes[1]).toBe(" ")
    // nodes[2] is the mention pill button
    expect(nodes[3]).toBe(" now and run")
    expect(nodes[4]).toBe(" ")
    // nodes[5] is the command chip
    expect(nodes[6]).toBe(" suite")
  })

  it("correctly parses mermaid diagram fenced code blocks", () => {
    const text = "```mermaid\ngraph TD;\n  A-->B;\n```"
    const blocks = parseMarkdownBlocks(text, false)
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe("code")
    if (blocks[0].type === "code") {
      expect(blocks[0].lang).toBe("mermaid")
      expect(blocks[0].content).toBe("graph TD;\n  A-->B;")
      expect(blocks[0].unclosed).toBe(false)
    }
  })

  it("handles unclosed streaming mermaid blocks without crashing", () => {
    const text = "```mermaid\nsequenceDiagram\nAlice->>John: Hello"
    const blocks = parseMarkdownBlocks(text, true)
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe("code")
    if (blocks[0].type === "code") {
      expect(blocks[0].lang).toBe("mermaid")
      expect(blocks[0].unclosed).toBe(true)
    }
  })

  it("renders MermaidPreviewModal with controls and SVG content", async () => {
    const React = await import("react")
    const { MermaidPreviewModal } = await import(
      "@/components/layout/chat/MermaidPreviewModal"
    )
    const { renderToString } = await import("react-dom/server")

    const closedHtml = renderToString(
      React.createElement(MermaidPreviewModal, {
        isOpen: false,
        svgContent: "<svg><g></g></svg>",
        code: "graph TD; A-->B",
        onClose: () => {},
      }),
    )
    expect(closedHtml).toBe("")

    const openHtml = renderToString(
      React.createElement(MermaidPreviewModal, {
        isOpen: true,
        svgContent: "<svg id='test-svg'><g></g></svg>",
        code: "graph TD; A-->B",
        onClose: () => {},
      }),
    )
    expect(openHtml).toContain("Mermaid Diagram Preview")
    expect(openHtml).toContain("test-svg")
    expect(openHtml).toContain("SVG")
  })
})

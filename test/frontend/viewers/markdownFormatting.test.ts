import { describe, it, expect, vi } from "vitest"
import { EditorState } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import {
  applyMarkdownFormatToView,
  type MarkdownFormatType,
} from "../../../src/components/layout/editor/CMEditor"

function createMockView(initialDoc: string, anchor = 0, head = anchor) {
  let currentState = EditorState.create({
    doc: initialDoc,
    selection: { anchor, head },
  })

  const mockView = {
    get state() {
      return currentState
    },
    dispatch(transactionSpec: any) {
      const tr = currentState.update(transactionSpec)
      currentState = tr.state
    },
    focus: vi.fn(),
  } as unknown as EditorView

  return {
    view: mockView,
    getState: () => currentState,
  }
}

describe("Markdown Formatting Engine (applyMarkdownFormatToView)", () => {
  describe("Bold formatting", () => {
    it("wraps selected text with double asterisks", () => {
      const { view, getState } = createMockView("Hello world", 0, 5)
      applyMarkdownFormatToView(view, "bold")

      expect(getState().doc.toString()).toBe("**Hello** world")
      expect(getState().selection.main.from).toBe(2)
      expect(getState().selection.main.to).toBe(7)
      expect(view.focus).toHaveBeenCalled()
    })

    it("inserts Bold placeholder and selects it when selection is empty", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "bold")

      expect(getState().doc.toString()).toBe("**Bold text**")
      expect(getState().selection.main.from).toBe(2)
      expect(getState().selection.main.to).toBe(11)
      expect(view.focus).toHaveBeenCalled()
    })
  })

  describe("Italic formatting", () => {
    it("wraps selected text with single asterisks", () => {
      const { view, getState } = createMockView("Italicize this word", 10, 14)
      applyMarkdownFormatToView(view, "italic")

      expect(getState().doc.toString()).toBe("Italicize *this* word")
      expect(getState().selection.main.from).toBe(11)
      expect(getState().selection.main.to).toBe(15)
      expect(view.focus).toHaveBeenCalled()
    })

    it("inserts Italic placeholder and selects it when selection is empty", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "italic")

      expect(getState().doc.toString()).toBe("*Italic text*")
      expect(getState().selection.main.from).toBe(1)
      expect(getState().selection.main.to).toBe(12)
    })
  })

  describe("Heading formatting (H1, H2, H3)", () => {
    it("inserts H1 heading placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "h1")

      expect(getState().doc.toString()).toBe("# Heading 1")
      expect(getState().selection.main.from).toBe(2)
      expect(getState().selection.main.to).toBe(11)
    })

    it("inserts H2 heading placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "h2")

      expect(getState().doc.toString()).toBe("## Heading 2")
      expect(getState().selection.main.from).toBe(3)
      expect(getState().selection.main.to).toBe(12)
    })

    it("inserts H3 heading placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "h3")

      expect(getState().doc.toString()).toBe("### Heading 3")
      expect(getState().selection.main.from).toBe(4)
      expect(getState().selection.main.to).toBe(13)
    })

    it("prepends prefix to non-heading non-empty line", () => {
      const { view, getState } = createMockView("My Section Title", 5, 5)
      applyMarkdownFormatToView(view, "h2")

      expect(getState().doc.toString()).toBe("## My Section Title")
    })

    it("replaces existing heading hashes when switching levels", () => {
      const { view, getState } = createMockView("### Sub-section", 6, 6)
      applyMarkdownFormatToView(view, "h1")

      expect(getState().doc.toString()).toBe("# Sub-section")
    })
  })

  describe("Lists formatting (Bullet, Numbered, Task)", () => {
    it("inserts bullet list item placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "bullet-list")

      expect(getState().doc.toString()).toBe("- List item")
      expect(getState().selection.main.from).toBe(2)
      expect(getState().selection.main.to).toBe(11)
    })

    it("prepends bullet prefix to non-empty line", () => {
      const { view, getState } = createMockView("First item", 3, 3)
      applyMarkdownFormatToView(view, "bullet-list")

      expect(getState().doc.toString()).toBe("- First item")
    })

    it("inserts numbered list item placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "numbered-list")

      expect(getState().doc.toString()).toBe("1. List item")
      expect(getState().selection.main.from).toBe(3)
      expect(getState().selection.main.to).toBe(12)
    })

    it("prepends numbered prefix to non-empty line", () => {
      const { view, getState } = createMockView("Ordered entry", 2, 2)
      applyMarkdownFormatToView(view, "numbered-list")

      expect(getState().doc.toString()).toBe("1. Ordered entry")
    })

    it("inserts task list item placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "task-list")

      expect(getState().doc.toString()).toBe("- [ ] Task item")
      expect(getState().selection.main.from).toBe(6)
      expect(getState().selection.main.to).toBe(15)
    })

    it("prepends task prefix to non-empty line", () => {
      const { view, getState } = createMockView("Buy coffee", 0, 0)
      applyMarkdownFormatToView(view, "task-list")

      expect(getState().doc.toString()).toBe("- [ ] Buy coffee")
    })
  })

  describe("Quote formatting", () => {
    it("inserts quote placeholder on empty line", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "quote")

      expect(getState().doc.toString()).toBe("> Quote text")
      expect(getState().selection.main.from).toBe(2)
      expect(getState().selection.main.to).toBe(12)
    })

    it("prepends > to non-empty line", () => {
      const { view, getState } = createMockView("Deep quote here", 4, 4)
      applyMarkdownFormatToView(view, "quote")

      expect(getState().doc.toString()).toBe("> Deep quote here")
    })
  })

  describe("Link formatting", () => {
    it("wraps selection as title and selects URL for quick editing", () => {
      const { view, getState } = createMockView("Visit Google today", 6, 12)
      applyMarkdownFormatToView(view, "link")

      expect(getState().doc.toString()).toBe(
        "Visit [Google](https://example.com) today",
      )
      const selFrom = getState().selection.main.from
      const selTo = getState().selection.main.to
      expect(getState().doc.sliceString(selFrom, selTo)).toBe(
        "https://example.com",
      )
    })

    it("inserts link placeholder with URL selected on empty selection", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "link")

      expect(getState().doc.toString()).toBe(
        "[link title](https://example.com)",
      )
      const selFrom = getState().selection.main.from
      const selTo = getState().selection.main.to
      expect(getState().doc.sliceString(selFrom, selTo)).toBe(
        "https://example.com",
      )
    })
  })

  describe("Table formatting", () => {
    it("inserts table template at cursor", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "table")

      expect(getState().doc.toString()).toContain("| Column 1 | Column 2 |")
      expect(getState().doc.toString()).toContain("| :--- | :--- |")
      expect(getState().doc.toString()).toContain("| Item A | Item B |")
    })

    it("adds spacing when inserting table on non-empty line", () => {
      const { view, getState } = createMockView("Some text before", 16, 16)
      applyMarkdownFormatToView(view, "table")

      expect(
        getState()
          .doc.toString()
          .startsWith("Some text before\n\n| Column 1 |"),
      ).toBe(true)
    })
  })

  describe("Code block formatting", () => {
    it("wraps selected text in code block fences", () => {
      const { view, getState } = createMockView("const x = 42;", 0, 13)
      applyMarkdownFormatToView(view, "code-block")

      expect(getState().doc.toString()).toBe(
        "```typescript\nconst x = 42;\n```",
      )
      const selFrom = getState().selection.main.from
      const selTo = getState().selection.main.to
      expect(getState().doc.sliceString(selFrom, selTo)).toBe("const x = 42;")
    })

    it("inserts placeholder code block when selection is empty", () => {
      const { view, getState } = createMockView("", 0, 0)
      applyMarkdownFormatToView(view, "code-block")

      expect(getState().doc.toString()).toBe(
        "```typescript\n// Code snippet\n```",
      )
    })
  })
})

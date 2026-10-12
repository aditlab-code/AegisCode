import { useEffect, useRef, useCallback } from "react"
import { EditorState, Compartment } from "@codemirror/state"
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  dropCursor,
  drawSelection,
  hoverTooltip,
} from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
  foldGutter,
  indentOnInput,
} from "@codemirror/language"
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete"
import { javascript } from "@codemirror/lang-javascript"
import { go } from "@codemirror/lang-go"
import { python } from "@codemirror/lang-python"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import {
  fetchLspCompletion,
  fetchLspHover,
  notifyLspChange,
  notifyLspOpen,
} from "../../../utils/lspApi"

export interface ActiveDebugLine {
  file: string
  line: number
}

interface CMEditorProps {
  filename: string
  content: string
  isReadOnly?: boolean
  wordWrap?: "on" | "off" | "wordWrapColumn"
  tabSize?: number
  fontSize?: number
  lineHeight?: number
  breakpoints?: number[]
  activeDebugLine?: ActiveDebugLine | null
  onChange: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
  onToggleBreakpoint?: (line: number) => void
  onSave?: () => void
  onFind?: () => void
}

function resolveLanguage(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  switch (ext) {
    case "ts":
      return { ext: javascript({ typescript: true }), id: "typescript" }
    case "tsx":
      return {
        ext: javascript({ typescript: true, jsx: true }),
        id: "typescriptreact",
      }
    case "js":
      return { ext: javascript(), id: "javascript" }
    case "jsx":
      return { ext: javascript({ jsx: true }), id: "javascriptreact" }
    case "go":
      return { ext: go(), id: "go" }
    case "py":
      return { ext: python(), id: "python" }
    case "json":
      return { ext: json(), id: "json" }
    case "md":
    case "markdown":
      return { ext: markdown(), id: "markdown" }
    case "html":
    case "htm":
      return { ext: html(), id: "html" }
    case "css":
      return { ext: css(), id: "css" }
    default:
      return { ext: null, id: "plaintext" }
  }
}

export function CMEditor({
  filename,
  content,
  isReadOnly = false,
  wordWrap = "off",
  tabSize = 2,
  fontSize = 13.5,
  lineHeight = 22,
  breakpoints = [],
  activeDebugLine,
  onChange,
  onCursorChange,
  onToggleBreakpoint,
  onSave,
  onFind,
}: CMEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const readOnlyCompartment = useRef(new Compartment())
  const wrapCompartment = useRef(new Compartment())
  const contentRef = useRef(content)
  contentRef.current = content

  const langInfo = resolveLanguage(filename)

  // Notify backend LSP of file open
  useEffect(() => {
    notifyLspOpen(filename, content, langInfo.id)
  }, [filename, langInfo.id])

  // Custom LSP autocomplete source
  const lspCompletionSource = useCallback(
    async (context: CompletionContext): Promise<CompletionResult | null> => {
      const word = context.matchBefore(/\w*/)
      if (!word && !context.explicit) return null

      const line = context.state.doc.lineAt(context.pos)
      const lineNum = line.number - 1 // 0-indexed for LSP
      const charNum = context.pos - line.from

      const items = await fetchLspCompletion(
        filename,
        lineNum,
        charNum,
        langInfo.id,
      )
      if (!items || items.length === 0) return null

      return {
        from: word ? word.from : context.pos,
        options: items.map((item) => ({
          label: item.label,
          type: item.kind ? "keyword" : "text",
          detail: item.detail,
          info:
            typeof item.documentation === "string"
              ? item.documentation
              : undefined,
          apply: item.insertText || item.label,
        })),
      }
    },
    [filename, langInfo.id],
  )

  // Custom LSP hover tooltip
  const lspHoverExtension = useCallback(() => {
    return hoverTooltip(async (view, pos) => {
      const line = view.state.doc.lineAt(pos)
      const lineNum = line.number - 1
      const charNum = pos - line.from

      const hover = await fetchLspHover(filename, lineNum, charNum, langInfo.id)
      if (!hover || !hover.contents) return null

      let text = ""
      if (typeof hover.contents === "string") {
        text = hover.contents
      } else if (typeof hover.contents === "object") {
        if ("value" in hover.contents) {
          text = String(hover.contents.value)
        } else {
          text = JSON.stringify(hover.contents)
        }
      }

      if (!text.trim()) return null

      return {
        pos,
        above: true,
        create() {
          const dom = document.createElement("div")
          dom.className =
            "cm-hover-card bg-surface-raised border border-line text-xs font-mono p-2 rounded shadow-lg max-w-sm text-ink whitespace-pre-wrap select-text z-50"
          dom.textContent = text
          return { dom }
        },
      }
    })
  }, [filename, langInfo.id])

  // Mount editor instance
  useEffect(() => {
    if (!containerRef.current) return

    const editorTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: `${fontSize}px`,
        backgroundColor: "transparent",
        color: "var(--color-ink)",
        fontFamily:
          "var(--editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace)",
      },
      ".cm-scroller": {
        overflow: "auto",
        lineHeight: `${lineHeight}px`,
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--color-ink-muted)",
        borderRight:
          "1px solid color-mix(in srgb, var(--color-line) 40%, transparent)",
        minWidth: "48px",
        userSelect: "none",
      },
      ".cm-activeLineGutter": {
        color: "var(--color-ink)",
        fontWeight: "600",
      },
      ".cm-activeLine": {
        backgroundColor:
          "color-mix(in srgb, var(--color-surface) 60%, transparent)",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-ink)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
        {
          backgroundColor:
            "color-mix(in srgb, var(--color-accent) 25%, transparent) !important",
        },
      ".cm-line": {
        padding: "0 8px",
      },
    })

    const customKeymaps = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSave?.()
          return true
        },
      },
      {
        key: "Mod-f",
        run: () => {
          onFind?.()
          return true
        },
      },
    ])

    const extensions = [
      lineNumbers({
        domEventHandlers: {
          mousedown(view, block) {
            const line = view.state.doc.lineAt(block.from)
            onToggleBreakpoint?.(line.number)
            return true
          },
        },
      }),
      foldGutter(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      readOnlyCompartment.current.of([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
      wrapCompartment.current.of(
        wordWrap === "on" || wordWrap === "wordWrapColumn"
          ? EditorView.lineWrapping
          : [],
      ),
      EditorState.tabSize.of(tabSize),
      editorTheme,
      customKeymaps,
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
      autocompletion({ override: [lspCompletionSource] }),
      lspHoverExtension(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const val = update.state.doc.toString()
          onChange(val)
          notifyLspChange(filename, val, langInfo.id)
        }
        if (update.selectionSet && onCursorChange) {
          const mainSel = update.state.selection.main
          const line = update.state.doc.lineAt(mainSel.head)
          onCursorChange(line.number, mainSel.head - line.from + 1)
        }
      }),
    ]

    if (langInfo.ext) {
      extensions.push(langInfo.ext)
    }

    const startState = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [filename])

  // Sync external content updates
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (content !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content },
      })
    }
  }, [content])

  // Sync read-only changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
    })
  }, [isReadOnly])

  // Sync word wrap changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.current.reconfigure(
        wordWrap === "on" || wordWrap === "wordWrapColumn"
          ? EditorView.lineWrapping
          : [],
      ),
    })
  }, [wordWrap])

  return (
    <div
      ref={containerRef}
      className="cm-editor-root flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden relative"
    />
  )
}

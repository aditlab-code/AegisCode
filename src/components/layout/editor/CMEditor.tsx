import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react"
import { EditorState, Compartment } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, hoverTooltip } from "@codemirror/view"
import { defaultKeymap, historyKeymap, undo, redo } from "@codemirror/commands"
import {
  autocompletion,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete"
import {
  MergeView,
  unifiedMergeView,
  goToNextChunk as cmGoToNextChunk,
  goToPreviousChunk as cmGoToPreviousChunk,
} from "@codemirror/merge"
import {
  lintGutter,
  setDiagnostics,
  type Diagnostic as CMDiagnostic,
} from "@codemirror/lint"
import {
  fetchLspCompletion,
  fetchLspDefinition,
  fetchLspFormatting,
  fetchLspHover,
  notifyLspChange,
  notifyLspOpen,
} from "../../../utils/lspApi"
import type {
  DiagnosticItem,
  EditorSelectionRange,
} from "../../../types/workbench"
import {
  getBaseEditorExtensions,
  resolveLanguage,
  createAegisEditorTheme,
} from "./cmTheme"

export interface GotoLineEventDetail {
  line: number
  col?: number
}

export interface ActiveDebugLine {
  file: string
  line: number
}

export interface CMEditorDiffConfig {
  original: string
  renderSideBySide?: boolean
  originalLabel?: string
  modifiedLabel?: string
}

export type MarkdownFormatType = "bold" | "italic" | "h1" | "h2" | "h3" | "bullet-list" | "numbered-list" | "task-list" | "quote" | "link" | "table" | "code-block"

export interface CMEditorHandle {
  goToNextChunk: () => void
  goToPrevChunk: () => void
  focus: () => void
  insertMarkdown: (type: MarkdownFormatType) => void
}

export interface CMEditorProps {
  filename: string
  content: string
  diff?: CMEditorDiffConfig
  isReadOnly?: boolean
  wordWrap?: "on" | "off" | "wordWrapColumn"
  tabSize?: number
  fontSize?: number
  lineHeight?: number
  breakpoints?: number[]
  activeDebugLine?: ActiveDebugLine | null
  diagnostics?: DiagnosticItem[]
  isDark?: boolean
  isFocused?: boolean
  onChange: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
  onSelectionChange?: (selection: EditorSelectionRange) => void
  onToggleBreakpoint?: (line: number) => void
  onNavigateDefinition?: (
    targetPath: string,
    line: number,
    column: number,
  ) => void
  onSave?: () => void
  onFind?: () => void
  formatOnSave?: boolean
  insertSpaces?: boolean
}

export function applyMarkdownFormatToView(
  view: EditorView,
  type: MarkdownFormatType,
) {
  const { state } = view
  const sel = state.selection.main
  const hasSelection = !sel.empty
  const selectedText = hasSelection ? state.sliceDoc(sel.from, sel.to) : ""

  switch (type) {
    case "bold": {
      const text = hasSelection ? selectedText : "Bold text"
      const insert = `**${text}**`
      const selFrom = sel.from + 2
      const selTo = selFrom + text.length
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: selFrom, head: selTo },
        userEvent: "input",
      })
      break
    }
    case "italic": {
      const text = hasSelection ? selectedText : "Italic text"
      const insert = `*${text}*`
      const selFrom = sel.from + 1
      const selTo = selFrom + text.length
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: selFrom, head: selTo },
        userEvent: "input",
      })
      break
    }
    case "h1":
    case "h2":
    case "h3": {
      const prefix = type === "h1" ? "# " : type === "h2" ? "## " : "### "
      const defaultPlaceholder =
        type === "h1" ? "Heading 1" : type === "h2" ? "Heading 2" : "Heading 3"
      const line = state.doc.lineAt(sel.from)
      const lineText = line.text
      if (!lineText.trim()) {
        const insert = `${prefix}${defaultPlaceholder}`
        view.dispatch({
          changes: { from: line.from, to: line.to, insert },
          selection: {
            anchor: line.from + prefix.length,
            head: line.from + insert.length,
          },
          userEvent: "input",
        })
      } else {
        const hashMatch = lineText.match(/^#{1,6}\s*/)
        if (hashMatch) {
          view.dispatch({
            changes: {
              from: line.from,
              to: line.from + hashMatch[0].length,
              insert: prefix,
            },
            userEvent: "input",
          })
        } else {
          view.dispatch({
            changes: { from: line.from, insert: prefix },
            userEvent: "input",
          })
        }
      }
      break
    }
    case "bullet-list":
    case "numbered-list":
    case "task-list": {
      const prefix =
        type === "bullet-list"
          ? "- "
          : type === "numbered-list"
            ? "1. "
            : "- [ ] "
      const placeholder =
        type === "bullet-list"
          ? "List item"
          : type === "numbered-list"
            ? "List item"
            : "Task item"
      const line = state.doc.lineAt(sel.from)
      const lineText = line.text
      if (!lineText.trim()) {
        const insert = `${prefix}${placeholder}`
        view.dispatch({
          changes: { from: line.from, to: line.to, insert },
          selection: {
            anchor: line.from + prefix.length,
            head: line.from + insert.length,
          },
          userEvent: "input",
        })
      } else {
        view.dispatch({
          changes: { from: line.from, insert: prefix },
          userEvent: "input",
        })
      }
      break
    }
    case "quote": {
      const line = state.doc.lineAt(sel.from)
      const lineText = line.text
      if (!lineText.trim()) {
        const insert = "> Quote text"
        view.dispatch({
          changes: { from: line.from, to: line.to, insert },
          selection: {
            anchor: line.from + 2,
            head: line.from + insert.length,
          },
          userEvent: "input",
        })
      } else {
        view.dispatch({
          changes: { from: line.from, insert: "> " },
          userEvent: "input",
        })
      }
      break
    }
    case "link": {
      const title = hasSelection ? selectedText : "link title"
      const url = "https://example.com"
      const insert = `[${title}](${url})`
      const urlStart = sel.from + title.length + 3
      const urlEnd = urlStart + url.length
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: urlStart, head: urlEnd },
        userEvent: "input",
      })
      break
    }
    case "table": {
      const tableTmpl =
        "| Column 1 | Column 2 |\n| :--- | :--- |\n| Item A | Item B |\n| Item C | Item D |"
      const line = state.doc.lineAt(sel.from)
      const needPrefixNewline = line.text.trim().length > 0
      const insert = needPrefixNewline ? `\n\n${tableTmpl}\n` : `${tableTmpl}\n`
      view.dispatch({
        changes: { from: sel.from, insert },
        selection: {
          anchor: sel.from + insert.length,
          head: sel.from + insert.length,
        },
        userEvent: "input",
      })
      break
    }
    case "code-block": {
      const code = hasSelection ? selectedText : "// Code snippet"
      const insert = `\`\`\`typescript\n${code}\n\`\`\``
      const codeStart = sel.from + "```typescript\n".length
      const codeEnd = codeStart + code.length
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: codeStart, head: codeEnd },
        userEvent: "input",
      })
      break
    }
  }

  view.focus()
}

export const CMEditor = forwardRef<CMEditorHandle, CMEditorProps>(
  function CMEditor(
    {
      filename,
      content,
      diff,
      isReadOnly = false,
      wordWrap = "off",
      tabSize = 2,
      fontSize = 13.5,
      lineHeight = 22,
      breakpoints: _breakpoints = [],
      activeDebugLine: _activeDebugLine,
      diagnostics = [],
      onChange,
      onCursorChange,
      onSelectionChange,
      onToggleBreakpoint,
      onNavigateDefinition,
      onSave,
      onFind,
      formatOnSave = true,
      insertSpaces = true,
      isDark = true,
      isFocused = true,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const mergeViewRef = useRef<MergeView | null>(null)
    const unifiedViewRef = useRef<EditorView | null>(null)

    const readOnlyCompartment = useRef(new Compartment())
    const wrapCompartment = useRef(new Compartment())
    const themeCompartment = useRef(new Compartment())
    const contentRef = useRef(content)
    contentRef.current = content

    const langInfo = resolveLanguage(filename)
    const lspChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Expose imperative handle for toolbar controls (e.g. diff chunk navigation, markdown insertion)
    useImperativeHandle(
      ref,
      () => ({
        goToNextChunk() {
          if (diff?.renderSideBySide && mergeViewRef.current) {
            cmGoToNextChunk(mergeViewRef.current.b)
          } else if (unifiedViewRef.current) {
            cmGoToNextChunk(unifiedViewRef.current)
          }
        },
        goToPrevChunk() {
          if (diff?.renderSideBySide && mergeViewRef.current) {
            cmGoToPreviousChunk(mergeViewRef.current.b)
          } else if (unifiedViewRef.current) {
            cmGoToPreviousChunk(unifiedViewRef.current)
          }
        },
        focus() {
          if (viewRef.current) {
            viewRef.current.focus()
          } else if (mergeViewRef.current) {
            mergeViewRef.current.b.focus()
          } else if (unifiedViewRef.current) {
            unifiedViewRef.current.focus()
          }
        },
        insertMarkdown(type: MarkdownFormatType) {
          const activeView =
            viewRef.current || mergeViewRef.current?.b || unifiedViewRef.current
          if (activeView) {
            applyMarkdownFormatToView(activeView, type)
          }
        },
      }),
      [diff?.renderSideBySide],
    )

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

    // Go to definition via LSP
    const handleGoToDefinition = useCallback(
      async (view: EditorView, targetPos?: number) => {
        const pos = targetPos ?? view.state.selection.main.head
        const line = view.state.doc.lineAt(pos)
        const lineNum = line.number - 1
        const charNum = pos - line.from

        const locs = await fetchLspDefinition(
          filename,
          lineNum,
          charNum,
          langInfo.id,
        )
        if (!locs || locs.length === 0) return

        const loc = locs[0]
        let targetPath = loc.uri
        if (targetPath.startsWith("file://")) {
          targetPath = targetPath.slice(7)
        }

        const isCurrentFile =
          targetPath === filename ||
          targetPath.endsWith("/" + filename) ||
          filename.endsWith(targetPath)

        const targetLine = (loc.range?.start?.line ?? 0) + 1
        const targetCol = (loc.range?.start?.character ?? 0) + 1

        if (isCurrentFile) {
          if (targetLine <= view.state.doc.lines) {
            const lineObj = view.state.doc.line(targetLine)
            const newPos = Math.min(
              lineObj.from + Math.max(0, targetCol - 1),
              lineObj.to,
            )
            view.dispatch({
              selection: { anchor: newPos },
              scrollIntoView: true,
            })
            view.focus()
          }
        } else if (onNavigateDefinition) {
          onNavigateDefinition(targetPath, targetLine, targetCol)
        }
      },
      [filename, langInfo.id, onNavigateDefinition],
    )

    // Explicit document formatting via LSP
    const handleFormatDocument = useCallback(
      async (view: EditorView) => {
        if (isReadOnly) return
        try {
          const edits = await fetchLspFormatting(
            filename,
            tabSize,
            insertSpaces,
            langInfo.id,
          )
          if (edits && edits.length > 0 && view.state) {
            const sortedEdits = [...edits].sort((a, b) => {
              if (a.range.start.line !== b.range.start.line) {
                return a.range.start.line - b.range.start.line
              }
              return a.range.start.character - b.range.start.character
            })
            const changes = sortedEdits.map((edit) => {
              const docLines = view.state.doc.lines
              const startLineNum = Math.max(
                1,
                Math.min(edit.range.start.line + 1, docLines),
              )
              const endLineNum = Math.max(
                1,
                Math.min(edit.range.end.line + 1, docLines),
              )
              const startLine = view.state.doc.line(startLineNum)
              const endLine = view.state.doc.line(endLineNum)
              const from = Math.max(
                startLine.from,
                Math.min(
                  startLine.from + edit.range.start.character,
                  startLine.to,
                ),
              )
              const to = Math.max(
                from,
                Math.min(endLine.from + edit.range.end.character, endLine.to),
              )
              return { from, to, insert: edit.newText }
            })
            view.dispatch({ changes })
          }
        } catch {
          // Non-blocking formatting fallback
        }
      },
      [filename, insertSpaces, isReadOnly, langInfo.id, tabSize],
    )

    // Save handler with optional format-on-save
    const handleSaveWithFormat = useCallback(
      async (view: EditorView) => {
        if (!isReadOnly && formatOnSave) {
          await handleFormatDocument(view)
        }
        onSave?.()
      },
      [formatOnSave, handleFormatDocument, isReadOnly, onSave],
    )

    // Custom LSP hover tooltip with Markdown code block parsing
    const lspHoverExtension = useCallback(() => {
      return hoverTooltip(async (view, pos) => {
        const line = view.state.doc.lineAt(pos)
        const lineNum = line.number - 1
        const charNum = pos - line.from

        const hover = await fetchLspHover(
          filename,
          lineNum,
          charNum,
          langInfo.id,
        )
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
              "cm-hover-card bg-surface-raised border border-line text-xs font-mono p-2.5 rounded shadow-xl max-w-md text-ink select-text z-50 flex flex-col gap-2"

            const parts = text.split(/(```[\s\S]*?```)/g)
            for (const part of parts) {
              if (part.startsWith("```")) {
                const lines = part.slice(3, -3).trim().split("\n")
                const lang = lines[0].trim()
                const code =
                  lang && lines.length > 1
                    ? lines.slice(1).join("\n")
                    : lines.join("\n")
                const pre = document.createElement("pre")
                pre.className =
                  "p-2 rounded bg-surface border border-line/60 font-mono text-[11px] text-accent overflow-x-auto whitespace-pre"
                pre.textContent = code
                dom.appendChild(pre)
              } else if (part.trim()) {
                const div = document.createElement("div")
                div.className =
                  "text-ink-muted text-xs leading-relaxed whitespace-pre-wrap font-sans"
                div.textContent = part.trim()
                dom.appendChild(div)
              }
            }
            return { dom }
          },
        }
      })
    }, [filename, langInfo.id])

    // Main CodeMirror lifecycle effect (handles both Normal and Diff mode)
    useEffect(() => {
      if (!containerRef.current) return

      const isSideBySide = diff?.renderSideBySide ?? true

      // Common keyboard shortcuts
      const customKeymaps = keymap.of([
        {
          key: "Mod-s",
          run: (view) => {
            void handleSaveWithFormat(view)
            return true
          },
        },
        {
          key: "Shift-Alt-f",
          run: (view) => {
            void handleFormatDocument(view)
            return true
          },
        },
        {
          key: "F12",
          run: (view) => {
            void handleGoToDefinition(view)
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

      // Auto-save on blur / focus transition
      const blurDomHandler = EditorView.domEventHandlers({
        blur() {
          if (!isReadOnly) {
            onSave?.()
          }
          return false
        },
      })

      // Go-to-definition click handler (Cmd+Click / Ctrl+Click)
      const clickDomHandler = EditorView.domEventHandlers({
        click(event, view) {
          if (event.metaKey || event.ctrlKey) {
            const pos = view.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            })
            if (pos !== null) {
              void handleGoToDefinition(view, pos)
              return true
            }
          }
          return false
        },
      })

      // Mode: DIFF MODE
      if (diff) {
        const originalContent = diff.original ?? ""
        const modifiedContent = content

        const baseExtensionsA = getBaseEditorExtensions({
          fontSize,
          lineHeight,
          tabSize,
          wordWrap,
          showFoldGutter: false,
          languageExtension: langInfo.ext,
          isDark,
        })

        const baseExtensionsB = getBaseEditorExtensions({
          fontSize,
          lineHeight,
          tabSize,
          wordWrap,
          showFoldGutter: false,
          languageExtension: langInfo.ext,
          isDark,
        })

        if (isSideBySide) {
          // Side-by-side MergeView
          const extensionsA = [
            ...baseExtensionsA,
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ]

          const extensionsB = [
            ...baseExtensionsB,
            lintGutter(),
            EditorState.readOnly.of(isReadOnly),
            EditorView.editable.of(!isReadOnly),
            blurDomHandler,
            clickDomHandler,
            customKeymaps,
            keymap.of([
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...historyKeymap,
            ]),
            autocompletion({ override: [lspCompletionSource] }),
            lspHoverExtension(),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && !isReadOnly) {
                const val = update.state.doc.toString()
                onChange(val)
                if (lspChangeTimerRef.current) {
                  clearTimeout(lspChangeTimerRef.current)
                }
                lspChangeTimerRef.current = setTimeout(() => {
                  notifyLspChange(filename, val, langInfo.id)
                }, 300)
              }
            }),
          ]

          const mergeView = new MergeView({
            a: {
              doc: originalContent,
              extensions: extensionsA,
            },
            b: {
              doc: modifiedContent,
              extensions: extensionsB,
            },
            parent: containerRef.current,
            revertControls: !isReadOnly ? "a-to-b" : undefined,
            highlightChanges: true,
            gutter: true,
          })

          mergeViewRef.current = mergeView
          unifiedViewRef.current = null
          viewRef.current = null

          return () => {
            if (lspChangeTimerRef.current) {
              clearTimeout(lspChangeTimerRef.current)
            }
            mergeView.destroy()
            mergeViewRef.current = null
          }
        } else {
          // Unified MergeView
          const unifiedExtensions = [
            ...baseExtensionsB,
            lintGutter(),
            EditorState.readOnly.of(isReadOnly),
            EditorView.editable.of(!isReadOnly),
            unifiedMergeView({
              original: originalContent,
              highlightChanges: true,
              gutter: true,
            }),
            blurDomHandler,
            clickDomHandler,
            customKeymaps,
            keymap.of([
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...historyKeymap,
            ]),
            autocompletion({ override: [lspCompletionSource] }),
            lspHoverExtension(),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && !isReadOnly) {
                const val = update.state.doc.toString()
                onChange(val)
                if (lspChangeTimerRef.current) {
                  clearTimeout(lspChangeTimerRef.current)
                }
                lspChangeTimerRef.current = setTimeout(() => {
                  notifyLspChange(filename, val, langInfo.id)
                }, 300)
              }
            }),
          ]

          const unifiedView = new EditorView({
            state: EditorState.create({
              doc: modifiedContent,
              extensions: unifiedExtensions,
            }),
            parent: containerRef.current,
          })

          unifiedViewRef.current = unifiedView
          mergeViewRef.current = null
          viewRef.current = null

          return () => {
            if (lspChangeTimerRef.current) {
              clearTimeout(lspChangeTimerRef.current)
            }
            unifiedView.destroy()
            unifiedViewRef.current = null
          }
        }
      }

      // Mode: NORMAL CODE EDITING MODE
      const baseExtensions = getBaseEditorExtensions({
        fontSize,
        lineHeight,
        tabSize,
        wordWrap,
        showFoldGutter: true,
        languageExtension: langInfo.ext,
        isDark,
        themeCompartment: themeCompartment.current,
      })

      const extensions = [
        ...baseExtensions,
        lineNumbers({
          domEventHandlers: {
            mousedown(view, block) {
              const line = view.state.doc.lineAt(block.from)
              onToggleBreakpoint?.(line.number)
              return true
            },
          },
        }),
        readOnlyCompartment.current.of([
          EditorState.readOnly.of(isReadOnly),
          EditorView.editable.of(!isReadOnly),
        ]),
        wrapCompartment.current.of(
          wordWrap === "on" || wordWrap === "wordWrapColumn"
            ? EditorView.lineWrapping
            : [],
        ),
        lintGutter(),
        blurDomHandler,
        clickDomHandler,
        customKeymaps,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        autocompletion({ override: [lspCompletionSource] }),
        lspHoverExtension(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const val = update.state.doc.toString()
            onChange(val)
            if (lspChangeTimerRef.current) {
              clearTimeout(lspChangeTimerRef.current)
            }
            lspChangeTimerRef.current = setTimeout(() => {
              notifyLspChange(filename, val, langInfo.id)
            }, 300)
          }
          if (update.selectionSet) {
            const mainSel = update.state.selection.main
            if (onCursorChange) {
              const line = update.state.doc.lineAt(mainSel.head)
              onCursorChange(line.number, mainSel.head - line.from + 1)
            }
            if (onSelectionChange) {
              const selectedText = mainSel.empty
                ? ""
                : update.state.sliceDoc(mainSel.from, mainSel.to)
              const startLine = update.state.doc.lineAt(mainSel.from).number
              const endLine = update.state.doc.lineAt(mainSel.to).number
              onSelectionChange({ startLine, endLine, selectedText })
            }
          }
        }),
      ]

      const startState = EditorState.create({
        doc: content,
        extensions,
      })

      const view = new EditorView({
        state: startState,
        parent: containerRef.current,
      })

      viewRef.current = view
      mergeViewRef.current = null
      unifiedViewRef.current = null

      return () => {
        if (lspChangeTimerRef.current) {
          clearTimeout(lspChangeTimerRef.current)
        }
        view.destroy()
        viewRef.current = null
      }
    }, [
      filename,
      diff ? diff.original : null,
      diff ? diff.renderSideBySide : null,
      diff ? isDark : null,
      isReadOnly,
      wordWrap,
      tabSize,
      fontSize,
      lineHeight,
    ])

    // Sync external content updates to the active view
    useEffect(() => {
      if (viewRef.current) {
        const currentDoc = viewRef.current.state.doc.toString()
        if (content !== currentDoc) {
          viewRef.current.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: content },
          })
        }
      } else if (mergeViewRef.current) {
        const docB = mergeViewRef.current.b.state.doc.toString()
        if (content !== docB) {
          mergeViewRef.current.b.dispatch({
            changes: { from: 0, to: docB.length, insert: content },
          })
        }
      } else if (unifiedViewRef.current) {
        const doc = unifiedViewRef.current.state.doc.toString()
        if (content !== doc) {
          unifiedViewRef.current.dispatch({
            changes: { from: 0, to: doc.length, insert: content },
          })
        }
      }
    }, [content])

    // Sync read-only changes in normal mode
    useEffect(() => {
      if (!viewRef.current) return
      viewRef.current.dispatch({
        effects: readOnlyCompartment.current.reconfigure([
          EditorState.readOnly.of(isReadOnly),
          EditorView.editable.of(!isReadOnly),
        ]),
      })
    }, [isReadOnly])

    // Sync word wrap changes in normal mode
    useEffect(() => {
      if (!viewRef.current) return
      viewRef.current.dispatch({
        effects: wrapCompartment.current.reconfigure(
          wordWrap === "on" || wordWrap === "wordWrapColumn"
            ? EditorView.lineWrapping
            : [],
        ),
      })
    }, [wordWrap])

    // Sync theme mode, fontSize, and lineHeight dynamically without full editor teardown
    useEffect(() => {
      if (!viewRef.current) return
      try {
        viewRef.current.dispatch({
          effects: themeCompartment.current.reconfigure(
            createAegisEditorTheme(fontSize, lineHeight, isDark),
          ),
        })
      } catch (err) {
        console.warn(
          "AegisCode: Failed to reconfigure editor theme compartment:",
          err,
        )
      }
    }, [fontSize, lineHeight, isDark])

    // Listen to global undo, redo, and format menu/command actions
    useEffect(() => {
      const handleUndo = () => {
        if (viewRef.current) undo(viewRef.current)
      }
      const handleRedo = () => {
        if (viewRef.current) redo(viewRef.current)
      }
      const handleFormat = () => {
        const activeView =
          viewRef.current || unifiedViewRef.current || mergeViewRef.current?.b
        if (activeView) void handleFormatDocument(activeView)
      }
      const handleGotoLine = (e: Event) => {
        const customEvent = e as CustomEvent<GotoLineEventDetail>
        const activeView =
          viewRef.current || unifiedViewRef.current || mergeViewRef.current?.b
        if (!activeView || !customEvent.detail) return
        const docLines = activeView.state.doc.lines
        const targetLine = Math.max(
          1,
          Math.min(customEvent.detail.line, docLines),
        )
        const lineObj = activeView.state.doc.line(targetLine)
        const targetCol = Math.max(1, customEvent.detail.col || 1)
        const pos = Math.min(lineObj.from + targetCol - 1, lineObj.to)
        activeView.dispatch({
          selection: { anchor: pos, head: pos },
          scrollIntoView: true,
        })
        activeView.focus()
      }
      const handleDef = () => {
        const activeView =
          viewRef.current || unifiedViewRef.current || mergeViewRef.current?.b
        if (activeView) void handleGoToDefinition(activeView)
      }
      window.addEventListener("aegis:editor-undo", handleUndo)
      window.addEventListener("aegis:editor-redo", handleRedo)
      window.addEventListener("aegis:editor-format", handleFormat)
      window.addEventListener("aegis:editor-goto-line", handleGotoLine)
      window.addEventListener("aegis:editor-definition", handleDef)
      return () => {
        window.removeEventListener("aegis:editor-undo", handleUndo)
        window.removeEventListener("aegis:editor-redo", handleRedo)
        window.removeEventListener("aegis:editor-format", handleFormat)
        window.removeEventListener("aegis:editor-goto-line", handleGotoLine)
        window.removeEventListener("aegis:editor-definition", handleDef)
      }
    }, [handleFormatDocument, handleGoToDefinition])

    // Sync external compiler/linter diagnostics into CodeMirror lint markers
    useEffect(() => {
      const view =
        viewRef.current || unifiedViewRef.current || mergeViewRef.current?.b
      if (!view) return

      const cmDiags: CMDiagnostic[] = []
      for (const d of diagnostics) {
        const matchLineCol = d.location.match(/\[(\d+),\s*(\d+)\]/)
        const matchLine = d.location.match(/:(\d+)/)
        let line = 1
        let col = 1
        if (matchLineCol) {
          line = parseInt(matchLineCol[1], 10)
          col = parseInt(matchLineCol[2], 10)
        } else if (matchLine) {
          line = parseInt(matchLine[1], 10)
        }

        if (line >= 1 && line <= view.state.doc.lines) {
          const lineObj = view.state.doc.line(line)
          const from = Math.min(lineObj.from + Math.max(0, col - 1), lineObj.to)
          const to = Math.max(from + 1, lineObj.to)
          cmDiags.push({
            from,
            to,
            severity: d.type === "error" ? "error" : "warning",
            message: d.title,
            source: d.source || "lsp",
          })
        }
      }

      view.dispatch(setDiagnostics(view.state, cmDiags))
    }, [diagnostics])

    const renderSideBySide = diff?.renderSideBySide ?? true

    return (
      <div className="cm-editor-root flex flex-col flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden relative">
        {/* Comparison sub-headers in diff mode */}
        {diff && (
          <>
            {renderSideBySide ? (
              <div className="flex items-center px-3 py-1 bg-surface-raised border-b border-line text-[10px] text-ink-muted font-semibold select-none shrink-0">
                <div className="flex-1 flex items-center justify-between pr-4 border-r border-line truncate">
                  <span>{diff.originalLabel || "ORIGINAL (HEAD)"}</span>
                  <span className="uppercase text-[9px] opacity-75">
                    READ-ONLY
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-between pl-4 truncate">
                  <span>{diff.modifiedLabel || "MODIFIED (WORKING TREE)"}</span>
                  <span className="uppercase text-[9px] opacity-75">
                    {isReadOnly ? "READ-ONLY" : "EDITABLE (⌘S TO SAVE)"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-1 bg-surface-raised border-b border-line text-[10px] text-ink-muted font-semibold select-none shrink-0">
                <span>UNIFIED DIFF ({filename})</span>
                <span className="uppercase text-[9px] opacity-75">
                  {isReadOnly ? "READ-ONLY" : "EDITABLE (⌘S TO SAVE)"}
                </span>
              </div>
            )}
          </>
        )}

        {/* CodeMirror mount canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden select-text"
        />
      </div>
    )
  },
)

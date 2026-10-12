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
  fetchLspCompletion,
  fetchLspHover,
  notifyLspChange,
  notifyLspOpen,
} from "../../../utils/lspApi"
import { getBaseEditorExtensions, resolveLanguage } from "./cmTheme"

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

export interface CMEditorHandle {
  goToNextChunk: () => void
  goToPrevChunk: () => void
  focus: () => void
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
  onChange: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
  onToggleBreakpoint?: (line: number) => void
  onSave?: () => void
  onFind?: () => void
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
      onChange,
      onCursorChange,
      onToggleBreakpoint,
      onSave,
      onFind,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const mergeViewRef = useRef<MergeView | null>(null)
    const unifiedViewRef = useRef<EditorView | null>(null)

    const readOnlyCompartment = useRef(new Compartment())
    const wrapCompartment = useRef(new Compartment())
    const contentRef = useRef(content)
    contentRef.current = content

    const langInfo = resolveLanguage(filename)
    const lspChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Expose imperative handle for toolbar controls (e.g. diff chunk navigation)
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

    // Custom LSP hover tooltip
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
              "cm-hover-card bg-surface-raised border border-line text-xs font-mono p-2 rounded shadow-lg max-w-sm text-ink whitespace-pre-wrap select-text z-50"
            dom.textContent = text
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

      // Auto-save on blur / focus transition
      const blurDomHandler = EditorView.domEventHandlers({
        blur() {
          if (!isReadOnly) {
            onSave?.()
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
        })

        const baseExtensionsB = getBaseEditorExtensions({
          fontSize,
          lineHeight,
          tabSize,
          wordWrap,
          showFoldGutter: false,
          languageExtension: langInfo.ext,
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
            EditorState.readOnly.of(isReadOnly),
            EditorView.editable.of(!isReadOnly),
            blurDomHandler,
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
            EditorState.readOnly.of(isReadOnly),
            EditorView.editable.of(!isReadOnly),
            unifiedMergeView({
              original: originalContent,
              highlightChanges: true,
              gutter: true,
              collapseUnchanged: { margin: 3 },
            }),
            blurDomHandler,
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
        blurDomHandler,
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
          if (update.selectionSet && onCursorChange) {
            const mainSel = update.state.selection.main
            const line = update.state.doc.lineAt(mainSel.head)
            onCursorChange(line.number, mainSel.head - line.from + 1)
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

    // Listen to global undo and redo menu actions
    useEffect(() => {
      const handleUndo = () => {
        if (viewRef.current) undo(viewRef.current)
      }
      const handleRedo = () => {
        if (viewRef.current) redo(viewRef.current)
      }
      window.addEventListener("aegis:editor-undo", handleUndo)
      window.addEventListener("aegis:editor-redo", handleRedo)
      return () => {
        window.removeEventListener("aegis:editor-undo", handleUndo)
        window.removeEventListener("aegis:editor-redo", handleRedo)
      }
    }, [])

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
          className="relative flex-1 w-full min-h-0 min-w-0 overflow-hidden select-text"
        />
      </div>
    )
  },
)

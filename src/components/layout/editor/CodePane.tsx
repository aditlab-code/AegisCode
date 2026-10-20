import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { Minimap } from "./Minimap"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  parseConflictRegions,
  resolveConflict,
  type ConflictRegion,
  type ConflictResolutionChoice,
} from "../../../utils/gitConflict"
import { CMEditor, isSameFile, type CMEditorHandle } from "./CMEditor"
import { EditorContextMenu } from "./EditorContextMenu"
import { fetchActiveFileGraph } from "../../../utils/codegraphApi"
import { streamAIChat } from "../../../utils/storeApi"
import { normalizeWorkspacePath } from "../../../utils/workspaceApi"
import {
  compileLatex,
  forwardSyncLatex,
  type LatexEngine,
} from "../../../services/latexService"
import type { CursorCoordinates } from "../../../store/slices/createWorkspaceSlice"
import type { EditorSelectionRange } from "../../../types/workbench"

interface CodePaneProps {
  paneId: "primary" | "secondary"
  filename: string
  isFocused: boolean
  secondary?: boolean
  onClose?: () => void
  editorRef?: React.Ref<CMEditorHandle>
}

const EMPTY_BREAKPOINTS: number[] = []

export function CodePane({
  paneId,
  filename,
  isFocused,
  secondary = false,
  onClose,
  editorRef,
}: CodePaneProps) {
  const {
    buffer,
    ensureFileBuffer,
    rootWorkspacePath,
    updateFileContent,
    setCursorPosition,
    setSelection,
    diagnostics,
    setFocusedPane,
    saveFile,
    revertFile,
    tabs,
    setSecondaryActiveTab,
    minimapEnabled,
    minimapScale,
    openFind,
    focusedGroup,
    tabSize,
    settings,
    fileBreakpoints,
    toggleBreakpoint,
    activeDebugLine,
    openFileInPane,
    sendChatMessage,
    setChatOpen,
    showToast,
    theme,
  } = useWorkbenchStore(
    useShallow((s) => {
      const clean = s.rootWorkspacePath
        ? normalizeWorkspacePath(filename, s.rootWorkspacePath)
        : filename
      return {
        buffer: s.fileBuffers[clean] || s.fileBuffers[filename],
        ensureFileBuffer: s.ensureFileBuffer,
        fetchBufferSafely: s.fetchBufferSafely,
        rootWorkspacePath: s.rootWorkspacePath,
        updateFileContent: s.updateFileContent,
        setCursorPosition: s.setCursorPosition,
        setSelection: s.setSelection,
        diagnostics: s.diagnostics,
        setFocusedPane: s.setFocusedPane,
        saveFile: s.saveFile,
        revertFile: s.revertFile,
        tabs: s.tabs,
        setSecondaryActiveTab: s.setSecondaryActiveTab,
        minimapEnabled: s.minimapEnabled,
        minimapScale: s.minimapScale,
        openFind: s.openFind,
        focusedGroup: s.focusedGroup,
        tabSize: s.tabSize,
        settings: s.settings,
        fileBreakpoints: s.breakpoints[filename] ?? EMPTY_BREAKPOINTS,
        toggleBreakpoint: s.toggleBreakpoint,
        activeDebugLine: s.activeDebugLine,
        openFileInPane: s.openFileInPane,
        sendChatMessage: s.sendChatMessage,
        setChatOpen: s.setChatOpen,
        showToast: s.showToast,
        theme: s.theme,
      }
    }),
  )

  const isDark = theme !== "light"
  const editorFontSize = settings?.editor?.fontSize ?? 13.5
  const editorLineHeight = settings?.editor?.lineHeight ?? 22
  const wordWrap = settings?.editor?.wordWrap ?? "off"
  const wordWrapColumn = settings?.editor?.wordWrapColumn ?? 80
  const minimapSide = settings?.editor?.minimapSide ?? "right"
  const accessibilityPageSize = settings?.editor?.accessibilityPageSize ?? 500
  const currentTabSize = settings?.editor?.tabSize ?? tabSize ?? 2
  const insertSpaces = settings?.editor?.insertSpaces ?? true
  const formatOnSave = settings?.editor?.formatOnSave ?? true
  const cursorBlinking = settings?.editor?.cursorBlinking ?? "smooth"
  const renderWhitespace = settings?.editor?.renderWhitespace ?? "selection"

  const paneRef = useRef<HTMLDivElement>(null)
  const internalEditorRef = useRef<CMEditorHandle | null>(null)
  const setEditorRef = useCallback(
    (handle: CMEditorHandle | null) => {
      internalEditorRef.current = handle
      if (typeof editorRef === "function") {
        editorRef(handle)
      } else if (editorRef && "current" in editorRef) {
        ;(editorRef as React.MutableRefObject<CMEditorHandle | null>).current =
          handle
      }
    },
    [editorRef],
  )
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const cursorPositionRef = useRef<CursorCoordinates>({ line: 1, col: 1 })
  const selectionRef = useRef<EditorSelectionRange>({
    startLine: 1,
    endLine: 1,
    selectedText: "",
  })
  const cursorDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const selectionDebounceTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      cursorPositionRef.current = { line, col }
      if (cursorDebounceTimerRef.current) {
        clearTimeout(cursorDebounceTimerRef.current)
      }
      cursorDebounceTimerRef.current = setTimeout(() => {
        setCursorPosition({ line, col })
      }, 120)
    },
    [setCursorPosition],
  )

  const handleSelectionChange = useCallback(
    (sel: EditorSelectionRange) => {
      selectionRef.current = sel
      if (selectionDebounceTimerRef.current) {
        clearTimeout(selectionDebounceTimerRef.current)
      }
      selectionDebounceTimerRef.current = setTimeout(() => {
        setSelection(sel)
      }, 120)
    },
    [setSelection],
  )

  useEffect(() => {
    return () => {
      if (cursorDebounceTimerRef.current) {
        clearTimeout(cursorDebounceTimerRef.current)
        setCursorPosition(cursorPositionRef.current)
      }
      if (selectionDebounceTimerRef.current) {
        clearTimeout(selectionDebounceTimerRef.current)
        setSelection(selectionRef.current)
      }
    }
  }, [setCursorPosition, setSelection])

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    line: number
    selectedText: string
  } | null>(null)
  const [inlineAiOpen, setInlineAiOpen] = useState(false)
  const [inlineAiPrompt, setInlineAiPrompt] = useState("")
  const [inlineAiStreaming, setInlineAiStreaming] = useState(false)
  const [inlineAiResult, setInlineAiResult] = useState<string | null>(null)
  const [inlineAiRange, setInlineAiRange] = useState<{
    startLine: number
    endLine: number
  } | null>(null)

  useEffect(() => {
    function handleOpenInlineAi() {
      if (!isFocused) return
      setInlineAiOpen((prev) => !prev)
      setInlineAiResult(null)
      setTimeout(() => inlineInputRef.current?.focus(), 30)
    }
    window.addEventListener("aegis:inline-ai-prompt", handleOpenInlineAi)
    return () =>
      window.removeEventListener("aegis:inline-ai-prompt", handleOpenInlineAi)
  }, [isFocused])

  useEffect(() => {
    if (
      filename &&
      (!buffer ||
        buffer.status === "idle" ||
        (buffer.content === "" &&
          !buffer.isDirty &&
          buffer.status !== "ready" &&
          buffer.status !== "loading" &&
          buffer.status !== "error")) &&
      typeof ensureFileBuffer === "function"
    ) {
      void ensureFileBuffer(filename)
    }
  }, [filename, buffer, ensureFileBuffer, rootWorkspacePath])

  const content = buffer?.content ?? ""
  const isDirty = buffer?.isDirty ?? false
  const lines = useMemo(() => content.split("\n"), [content])
  const [minimapLines, setMinimapLines] = useState(() => content.split("\n"))

  useEffect(() => {
    if (content.length < 5000) {
      setMinimapLines(content.split("\n"))
      return
    }
    const timer = setTimeout(() => {
      setMinimapLines(content.split("\n"))
    }, 120)
    return () => clearTimeout(timer)
  }, [content])

  useEffect(() => {
    setMinimapLines(content.split("\n"))
  }, [filename])

  const filteredDiagnostics = useMemo(
    () => diagnostics.filter((d) => d.location.startsWith(filename)),
    [diagnostics, filename],
  )

  const conflictRegions = useMemo(() => {
    if (!content.includes("<<<<<<<")) return []
    return parseConflictRegions(content)
  }, [content])

  const handleResolveConflict = (
    region: ConflictRegion,
    choice: ConflictResolutionChoice,
  ) => {
    const newContent = resolveConflict(content, region, choice)
    updateFileContent(filename, newContent)
  }

  const handleInlineAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const instruction = inlineAiPrompt.trim()
    if (!instruction || inlineAiStreaming) return

    const targetLine = cursorPositionRef.current.line || 1
    const selStart = selectionRef.current?.startLine || targetLine
    const selEnd = selectionRef.current?.endLine || targetLine
    const range = { startLine: selStart, endLine: selEnd }
    setInlineAiRange(range)

    const snippet =
      selectionRef.current?.selectedText?.trim() ||
      lines.slice(selStart - 1, selEnd).join("\n")

    setInlineAiStreaming(true)
    setInlineAiResult("")

    let accumulated = ""
    try {
      await streamAIChat(
        {
          prompt: `You are an expert AI code editor for AegisCode.\nFile: ${filename}\nLine Range: L${selStart}-L${selEnd}\nCode:\n\`\`\`\n${snippet}\n\`\`\`\n\nInstruction: ${instruction}\n\nIMPORTANT: Return ONLY the replacement code for this exact block. Do NOT include Markdown backticks or commentary outside the code.`,
        },
        (ev) => {
          if (ev.type === "chunk" && ev.delta) {
            accumulated += ev.delta
            setInlineAiResult(accumulated)
          } else if (ev.type === "error") {
            showToast(`Inline AI Error: ${ev.error || "Failed to generate"}`)
          }
        },
      )
    } catch (err: any) {
      showToast(`Inline AI request failed: ${err.message || String(err)}`)
    } finally {
      setInlineAiStreaming(false)
    }
  }

  const handleAcceptInlineAi = () => {
    if (!inlineAiResult || !inlineAiRange) return
    const cleanedResult = inlineAiResult
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
    const beforeLines = lines.slice(0, inlineAiRange.startLine - 1)
    const afterLines = lines.slice(inlineAiRange.endLine)
    const newContent = [...beforeLines, cleanedResult, ...afterLines].join("\n")
    updateFileContent(filename, newContent)
    showToast(
      `Applied AI edit at L${inlineAiRange.startLine}-L${inlineAiRange.endLine}`,
    )
    setInlineAiResult(null)
    setInlineAiOpen(false)
    setInlineAiPrompt("")
    setInlineAiRange(null)
  }

  const handleRejectInlineAi = () => {
    setInlineAiResult(null)
  }

  const handleOpenInChat = () => {
    if (!inlineAiPrompt) return
    const targetLine = cursorPositionRef.current.line || 1
    const selStart =
      selectionRef.current?.startLine || Math.max(1, targetLine - 10)
    const selEnd =
      selectionRef.current?.endLine || Math.min(lines.length, targetLine + 15)
    const snippet =
      selectionRef.current?.selectedText?.trim() ||
      lines.slice(selStart - 1, selEnd).join("\n")

    setChatOpen(true)
    sendChatMessage(
      `[Inline Edit · ${filename}:L${selStart}-${selEnd}]\nInstruction: ${inlineAiPrompt}`,
      [
        {
          id: `inline-${filename}-${Date.now()}`,
          type: "selection",
          path: filename,
          lineRange: `L${selStart}-L${selEnd}`,
          content: snippet,
          charCount: snippet.length,
          estimatedTokens: Math.ceil(snippet.length / 4),
          mode: "selection",
        },
      ],
    )
    setInlineAiOpen(false)
    setInlineAiPrompt("")
    setInlineAiResult(null)
  }

  const [scrollInfo, setScrollInfo] = useState({
    scrollTop: 0,
    scrollHeight: 1,
    clientHeight: 1,
  })

  useEffect(() => {
    const scroller = paneRef.current?.querySelector(".cm-scroller")
    if (!scroller) return

    let rafId: number | null = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrollInfo({
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight || 1,
          clientHeight: scroller.clientHeight || 1,
        })
      })
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    onScroll()

    const ro = new ResizeObserver(() => {
      onScroll()
    })
    ro.observe(scroller)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      scroller.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [filename, buffer?.status])

  const handleScrollToLine = useCallback(
    (lineIndex: number, smooth: boolean = true) => {
      if (internalEditorRef.current?.scrollToLine) {
        internalEditorRef.current.scrollToLine(lineIndex, smooth)
        return
      }
      const scroller = paneRef.current?.querySelector(".cm-scroller")
      if (!scroller) return
      const target = Math.max(0, lineIndex * editorLineHeight - 60)
      if (smooth) {
        scroller.scrollTo({ top: target, behavior: "smooth" })
      } else {
        scroller.scrollTop = target
      }
    },
    [editorLineHeight],
  )

  const isLatexFile = useMemo(() => {
    const lower = filename.toLowerCase()
    return lower.endsWith(".tex") || lower.endsWith(".latex")
  }, [filename])

  const [latexEngine, setLatexEngine] = useState<LatexEngine>("auto")
  const [isCompilingLatex, setIsCompilingLatex] = useState(false)

  const handleCompileLatex = useCallback(async () => {
    if (!filename || isCompilingLatex) return
    setIsCompilingLatex(true)
    showToast?.("Compiling LaTeX document...", "info")
    try {
      const res = await compileLatex(filename, latexEngine)
      if (res.success) {
        showToast?.(
          `Compiled successfully with ${res.engineUsed} in ${res.durationMs}ms`,
          "success",
        )
        if (res.pdfPath) {
          const st = useWorkbenchStore.getState()
          if (typeof st.openFileInGroup === "function") {
            st.openFileInGroup(res.pdfPath, "group2")
            st.setSplitEditor(true)
            st.setFocusedGroup("group1")
          } else {
            openFileInPane(res.pdfPath)
          }
        }
      } else {
        const firstErr = res.errors?.[0] || "LaTeX compilation failed"
        showToast?.(firstErr, "error")
      }
    } catch (err: any) {
      showToast?.(err.message || "Failed to compile LaTeX", "error")
    } finally {
      setIsCompilingLatex(false)
    }
  }, [filename, latexEngine, isCompilingLatex, showToast, openFileInPane])

  const handleForwardSync = useCallback(async () => {
    if (!filename) return
    const line = cursorPositionRef.current.line || 1
    const col = cursorPositionRef.current.col || 1
    try {
      const target = await forwardSyncLatex(filename, line, col)
      if (target?.pdfFile) {
        const st = useWorkbenchStore.getState()
        if (typeof st.openFileInGroup === "function") {
          st.openFileInGroup(target.pdfFile, "group2")
          st.setSplitEditor(true)
          st.setFocusedGroup("group1")
        } else {
          openFileInPane(target.pdfFile)
        }
      }
      window.dispatchEvent(
        new CustomEvent("aegis:pdf-synctex-forward", {
          detail: target,
        }),
      )
    } catch (err: any) {
      const errMsg = String(err?.message || "")
      if (errMsg.includes("not compiled yet") || errMsg.includes("not found")) {
        showToast?.("PDF not found. Compiling document first...", "info")
        await handleCompileLatex()
      } else {
        showToast?.(err.message || "SyncTeX forward search failed", "warning")
      }
    }
  }, [filename, showToast, openFileInPane])

  // Keyboard shortcuts: Ctrl+Alt+B to compile, Ctrl+Alt+J to forward sync
  useEffect(() => {
    if (!isFocused || !isLatexFile) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault()
        void handleCompileLatex()
      } else if (mod && e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault()
        void handleForwardSync()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFocused, isLatexFile, handleCompileLatex, handleForwardSync])

  return (
    <div
      ref={paneRef}
      className={`text-editor editor-pane relative ${
        isFocused ? "text-editor-focused editor-pane-focused" : ""
      }`}
      onClick={() => setFocusedPane(paneId)}
    >
      {secondary && (
        <div className="split-pane-title">
          <div className="split-title-left">
            <Icon name="code" size={13} />
            <select
              aria-label="Secondary pane file"
              className="split-file-selector"
              onChange={(e) => setSecondaryActiveTab(e.target.value)}
              value={filename}
            >
              {tabs.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>
            {isDirty && (
              <span
                aria-label="Unsaved changes"
                className="tab-dirty-dot"
                title="Unsaved changes"
              />
            )}
          </div>
          <IconButton label="Close split editor" onClick={onClose}>
            <Icon name="close" size={13} />
          </IconButton>
        </div>
      )}

      {isLatexFile && (
        <div className="flex items-center justify-between px-3 py-1 bg-surface border-b border-line text-xs select-none">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-mono text-accent font-semibold">
              <Icon name="code" size={12} />
              <span>LaTeX</span>
            </span>
            <select
              value={latexEngine}
              onChange={(e) => setLatexEngine(e.target.value as any)}
              className="bg-canvas border border-line rounded px-1.5 py-0.5 text-[11px] text-ink outline-none cursor-pointer"
              title="Select LaTeX Compiler Engine"
            >
              <option value="auto">Auto (Detect)</option>
              <option value="xelatex">XeLaTeX (latexmk)</option>
              <option value="pdflatex">pdfLaTeX (latexmk)</option>
              <option value="lualatex">LuaLaTeX (latexmk)</option>
              <option value="tectonic">Tectonic (Standalone)</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isCompilingLatex}
              onClick={handleCompileLatex}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-accent hover:bg-accent-soft text-canvas text-[11px] font-medium transition-opacity disabled:opacity-50 cursor-pointer"
              title="Compile Document (Ctrl+Alt+B)"
            >
              {isCompilingLatex ? (
                <>
                  <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Compiling...</span>
                </>
              ) : (
                <>
                  <Icon name="play" size={11} />
                  <span>Compile (Ctrl+Alt+B)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isCompilingLatex}
              onClick={handleForwardSync}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-raised hover:bg-surface-hover text-ink text-[11px] border border-line transition-colors cursor-pointer"
              title="Jump to PDF at Cursor (SyncTeX Forward Search - Ctrl+Alt+J)"
            >
              <Icon name="external-link" size={11} />
              <span>Jump to PDF (Ctrl+Alt+J)</span>
            </button>
          </div>
        </div>
      )}

      {buffer?.hasDiskConflict && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              File modified externally on disk. Local unsaved edits are
              preserved.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-ink text-[11px] border border-line cursor-pointer"
              onClick={() => revertFile(filename)}
            >
              Revert to Disk
            </button>
            <button
              type="button"
              className="px-2 py-0.5 rounded bg-accent hover:bg-accent-soft text-canvas text-[11px] font-semibold cursor-pointer"
              onClick={() => saveFile(filename)}
            >
              Overwrite Disk
            </button>
          </div>
        </div>
      )}

      {buffer?.isDeletedOnDisk && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-error text-xs text-error">
          <div className="flex items-center gap-1.5">
            <Icon name="trash" size={13} />
            <span>File has been deleted from disk.</span>
          </div>
          <button
            type="button"
            className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-ink text-[11px] border border-line cursor-pointer"
            onClick={() => saveFile(filename)}
          >
            Re-save File
          </button>
        </div>
      )}

      {buffer?.isLargeFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              Large file ({((buffer.fileSize ?? 0) / (1024 * 1024)).toFixed(1)}{" "}
              MB). Showing first 64KB sample in read-only mode to preserve
              system memory.
            </span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-line text-ink-muted">
            Read-Only
          </span>
        </div>
      )}

      {buffer?.isBinary && !buffer?.isLargeFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              Binary file detected. Displaying preview in read-only mode to
              prevent data corruption.
            </span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-line text-ink-muted">
            Read-Only
          </span>
        </div>
      )}

      {inlineAiOpen && (
        <div className="flex flex-col bg-surface-raised border-b border-accent/50 text-xs shadow-md z-20">
          <form
            onSubmit={handleInlineAiSubmit}
            className="flex items-center gap-2 px-3 py-1.5"
          >
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono text-[10px] font-semibold shrink-0">
              <Icon name="sparkle" size={11} />
              <span>
                AI Edit ·{" "}
                {selectionRef.current?.selectedText
                  ? `L${selectionRef.current.startLine}-L${selectionRef.current.endLine}`
                  : `Ln ${cursorPositionRef.current.line}`}
              </span>
            </span>
            <input
              ref={inlineInputRef}
              type="text"
              value={inlineAiPrompt}
              onChange={(e) => setInlineAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation()
                  setInlineAiOpen(false)
                  setInlineAiResult(null)
                }
              }}
              placeholder="Ask Aegis AI to refactor, document, or fix code at cursor... (Enter to generate, Esc to close)"
              className="flex-1 bg-canvas px-2.5 py-1 rounded border border-line focus:border-accent outline-none text-xs text-ink placeholder:text-ink-muted"
            />
            <button
              type="submit"
              disabled={!inlineAiPrompt.trim() || inlineAiStreaming}
              className="px-2.5 py-1 rounded bg-accent text-accent-contrast font-medium text-[11px] hover:opacity-90 disabled:opacity-40 cursor-pointer shrink-0"
            >
              {inlineAiStreaming ? "Generating..." : "Generate (Enter)"}
            </button>
            <button
              type="button"
              onClick={handleOpenInChat}
              className="px-2 py-1 rounded bg-surface hover:bg-surface-hover border border-line text-ink-muted hover:text-ink text-[11px] cursor-pointer shrink-0"
              title="Open full conversation in Chat Drawer"
            >
              Ask Chat ↗
            </button>
            <button
              type="button"
              onClick={() => {
                setInlineAiOpen(false)
                setInlineAiResult(null)
              }}
              className="p-1 text-ink-muted hover:text-ink cursor-pointer"
              title="Close Inline AI (Esc)"
            >
              <Icon name="close" size={12} />
            </button>
          </form>

          {inlineAiResult !== null && (
            <div className="px-3 pb-2 pt-1 border-t border-line/60 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-accent flex items-center gap-1">
                  <Icon name="sparkle" size={12} />
                  <span>Generated Edit Preview:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAcceptInlineAi}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
                  >
                    Accept (✓)
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectInlineAi}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-hover hover:bg-line text-ink cursor-pointer"
                  >
                    Discard (✕)
                  </button>
                </div>
              </div>
              <pre className="p-2 rounded bg-canvas border border-line text-[11px] font-mono text-ink max-h-48 overflow-auto whitespace-pre">
                {inlineAiResult ||
                  (inlineAiStreaming ? "Generating replacement..." : "")}
              </pre>
            </div>
          )}
        </div>
      )}

      {conflictRegions.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2 bg-surface-raised border-b border-warning/40 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="git" size={14} className="text-warning" />
              <span className="font-semibold text-ink">
                Merge Conflicts Detected ({conflictRegions.length}{" "}
                {conflictRegions.length === 1 ? "region" : "regions"})
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {conflictRegions.map((region, idx) => (
              <div
                key={region.id}
                className="flex items-center justify-between py-1 px-2 rounded bg-surface border border-line text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">
                    #{idx + 1} (L{region.startLine}–L{region.endLine}):
                  </span>
                  <span className="text-sky-400 font-mono">
                    {region.currentBranch}
                  </span>
                  <span className="text-ink-muted">vs</span>
                  <span className="text-emerald-400 font-mono">
                    {region.incomingBranch}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "current")}
                    className="text-sky-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Current
                  </button>
                  <span className="text-ink-muted">|</span>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "incoming")}
                    className="text-emerald-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Incoming
                  </button>
                  <span className="text-ink-muted">|</span>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "both")}
                    className="text-purple-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Both
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        aria-label={`${filename} code editor`}
        className={`text-editor-body code-editor ${
          minimapSide === "left" ? "minimap-side-left" : ""
        }`}
        data-accessibility-page-size={accessibilityPageSize}
        data-cursor-blinking={cursorBlinking}
        data-render-whitespace={renderWhitespace}
        data-word-wrap={wordWrap}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            line: cursorPositionRef.current.line,
            selectedText: selectionRef.current.selectedText,
          })
        }}
        role="region"
        style={
          {
            "--editor-tab-size": currentTabSize,
            "--editor-wrap-column": wordWrapColumn,
          } as React.CSSProperties
        }
      >
        {!buffer || buffer.status === "loading" ? (
          <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-canvas text-ink-muted text-xs gap-2 select-none">
            <span className="animate-spin text-accent">
              <Icon name="refresh" size={16} />
            </span>
            <span className="font-mono text-[11px]">
              Loading {filename.split("/").pop()}...
            </span>
          </div>
        ) : buffer.status === "error" ? (
          <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-canvas text-ink p-6 text-center gap-3 select-none">
            <span className="w-10 h-10 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center">
              <Icon name="warning" size={20} />
            </span>
            <div className="max-w-md">
              <h4 className="text-sm font-semibold mb-1 text-ink">
                Failed to load file
              </h4>
              <p className="text-xs text-ink-muted break-words font-mono mb-4">
                Unable to read {filename.split("/").pop()} from workspace
                storage or disk.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => fetchBufferSafely(filename)}
                  className="px-3 py-1.5 rounded bg-accent text-canvas hover:bg-accent-hover transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                  type="button"
                >
                  <Icon name="refresh" size={13} />
                  <span>Retry Loading</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-editor-surface code-editor-layout">
            <CMEditor
              ref={setEditorRef}
              filename={filename}
              content={content}
              isReadOnly={Boolean(buffer?.isLargeFile || buffer?.isBinary)}
              wordWrap={wordWrap}
              tabSize={currentTabSize}
              fontSize={editorFontSize}
              lineHeight={editorLineHeight}
              breakpoints={fileBreakpoints}
              activeDebugLine={activeDebugLine}
              diagnostics={filteredDiagnostics}
              isDark={isDark}
              isFocused={isFocused}
              onChange={(newVal) => updateFileContent(filename, newVal)}
              onCursorChange={handleCursorChange}
              onSelectionChange={handleSelectionChange}
              onNavigateDefinition={(targetPath, line, col) => {
                openFileInPane(targetPath)
                cursorPositionRef.current = { line, col }
                setCursorPosition({ line, col })
                window.dispatchEvent(
                  new CustomEvent("aegis:focus-symbol", {
                    detail: { name: targetPath, line },
                  }),
                )
              }}
              onToggleBreakpoint={(line) => toggleBreakpoint(filename, line)}
              onSave={() => saveFile(filename)}
              onFind={() => openFind(focusedGroup, false)}
              onScroll={setScrollInfo}
              formatOnSave={formatOnSave}
              insertSpaces={insertSpaces}
            />
          </div>
        )}
        {minimapEnabled && (
          <Minimap
            filename={filename}
            clientHeight={scrollInfo.clientHeight}
            editorFontSize={editorFontSize}
            editorLineHeight={editorLineHeight}
            lines={minimapLines}
            onScrollToLine={handleScrollToLine}
            scale={minimapScale}
            scrollHeight={scrollInfo.scrollHeight}
            scrollTop={scrollInfo.scrollTop}
          />
        )}
      </div>

      {contextMenu && (
        <EditorContextMenu
          filename={filename}
          line={contextMenu.line}
          onClose={() => setContextMenu(null)}
          selectedText={contextMenu.selectedText}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}
    </div>
  )
}

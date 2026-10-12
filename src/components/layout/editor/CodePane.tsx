import {
  useRef,
  useState,
  useEffect,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { Minimap } from "./Minimap"
import { DiagnosticHoverCard } from "./DiagnosticHoverCard"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { tokenizeLine } from "../../../utils/syntax"
import type { DiagnosticItem } from "../../../types/workbench"

interface CodePaneProps {
  paneId: "primary" | "secondary"
  filename: string
  isFocused: boolean
  secondary?: boolean
  onClose?: () => void
}

export function CodePane({
  paneId,
  filename,
  isFocused,
  secondary = false,
  onClose,
}: CodePaneProps) {
  const {
    fileBuffers,
    updateFileContent,
    setCursorPosition,
    cursorPosition,
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
    breakpoints,
    toggleBreakpoint,
    activeDebugLine,
  } = useWorkbench()

  const editorFontSize = settings?.editor?.fontSize ?? 13.5
  const editorLineHeight = settings?.editor?.lineHeight ?? 22
  const wordWrap = settings?.editor?.wordWrap ?? "off"
  const wordWrapColumn = settings?.editor?.wordWrapColumn ?? 80
  const minimapSide = settings?.editor?.minimapSide ?? "right"
  const accessibilityPageSize = settings?.editor?.accessibilityPageSize ?? 500
  const currentTabSize = settings?.editor?.tabSize ?? tabSize ?? 2
  const insertSpaces = settings?.editor?.insertSpaces ?? true
  const cursorBlinking = settings?.editor?.cursorBlinking ?? "smooth"
  const renderWhitespace = settings?.editor?.renderWhitespace ?? "selection"

  const commentsSettings = settings?.features?.comments
  const todoOptions = useMemo(() => {
    if (!commentsSettings) return undefined
    return {
      enabled: commentsSettings.enableTodoHighlight,
      keywords: commentsSettings.todoKeywords
        ? commentsSettings.todoKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : undefined,
    }
  }, [commentsSettings?.enableTodoHighlight, commentsSettings?.todoKeywords])

  const gutterRef = useRef<HTMLDivElement>(null)
  const syntaxRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const buffer = fileBuffers[filename]
  const content = buffer?.content ?? ""
  const isDirty = buffer?.isDirty ?? false
  const lines = content.split("\n")

  const fileDiagnostics = diagnostics.filter((d) =>
    d.location.startsWith(filename),
  )

  const [hoverDiag, setHoverDiag] = useState<{
    diag: DiagnosticItem
    x: number
    y: number
  } | null>(null)

  const [scrollInfo, setScrollInfo] = useState({
    scrollTop: 0,
    scrollHeight: 1,
    clientHeight: 1,
  })

  useEffect(() => {
    function updateDimensions() {
      if (textareaRef.current) {
        setScrollInfo({
          scrollTop: textareaRef.current.scrollTop,
          scrollHeight: textareaRef.current.scrollHeight || 1,
          clientHeight: textareaRef.current.clientHeight || 1,
        })
      }
    }
    updateDimensions()
    const timer = setTimeout(updateDimensions, 60)
    window.addEventListener("resize", updateDimensions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", updateDimensions)
    }
  }, [filename, content])

  function getLineDiagnostic(lineNum: number) {
    return fileDiagnostics.find((d) => {
      const match = d.location.match(/\[(\d+),/)
      return match && parseInt(match[1], 10) === lineNum
    })
  }

  function handleTextareaMouseMove(e: MouseEvent<HTMLTextAreaElement>) {
    if (!textareaRef.current) return
    const rect = textareaRef.current.getBoundingClientRect()
    const relativeY = e.clientY - rect.top + textareaRef.current.scrollTop - 9
    const lineNum = Math.floor(relativeY / editorLineHeight) + 1

    if (lineNum >= 1 && lineNum <= lines.length) {
      const diag = getLineDiagnostic(lineNum)
      if (diag) {
        setHoverDiag({
          diag,
          x: e.clientX,
          y: e.clientY + 14,
        })
        return
      }
    }
    setHoverDiag(null)
  }

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = target.scrollTop
      syntaxRef.current.scrollLeft = target.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop
    }
    setScrollInfo({
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    })
  }

  function handleScrollToLine(lineIndex: number) {
    if (!textareaRef.current) return
    const targetScroll = Math.max(0, lineIndex * editorLineHeight - 60)
    textareaRef.current.scrollTop = targetScroll
    if (syntaxRef.current) syntaxRef.current.scrollTop = targetScroll
    if (gutterRef.current) gutterRef.current.scrollTop = targetScroll
    setScrollInfo({
      scrollTop: targetScroll,
      scrollHeight: textareaRef.current.scrollHeight,
      clientHeight: textareaRef.current.clientHeight,
    })
  }

  const selectionTimerRef = useRef<NodeJS.Timeout | null>(null)

  function updateCursor() {
    if (!textareaRef.current) return
    const el = textareaRef.current
    const pos = el.selectionStart
    const textUpToCursor = el.value.slice(0, pos)
    const currentLines = textUpToCursor.split("\n")
    const line = currentLines.length
    const col = currentLines[currentLines.length - 1].length + 1
    setCursorPosition({ line, col })

    if (setSelection) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current)
      }
      selectionTimerRef.current = setTimeout(() => {
        if (!textareaRef.current) return
        const s = textareaRef.current.selectionStart
        const e = textareaRef.current.selectionEnd
        if (s === e) {
          setSelection({ startLine: line, endLine: line, selectedText: "" })
          return
        }
        const selected = textareaRef.current.value.slice(s, e)
        const textBefore = textareaRef.current.value.slice(0, s)
        const startLine = textBefore.split("\n").length
        const endLine = startLine + selected.split("\n").length - 1
        setSelection({
          startLine,
          endLine,
          selectedText: selected,
        })
      }, 150)
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    updateFileContent(filename, event.target.value)
    updateCursor()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Save shortcut
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      saveFile(filename)
      return
    }

    // In-editor Find shortcut
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault()
      openFind(focusedGroup, false)
      return
    }

    // In-editor Replace shortcut
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === "h"
    ) {
      event.preventDefault()
      openFind(focusedGroup, true)
      return
    }

    // Tab key: Insert spaces or tab matching editor settings
    if (event.key === "Tab") {
      event.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const insertStr = insertSpaces ? " ".repeat(currentTabSize) : "\t"
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent =
        content.slice(0, start) + insertStr + content.slice(end)

      updateFileContent(filename, newContent)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd =
          start + insertStr.length
        updateCursor()
      })
      return
    }

    // Enter key: Maintain indentation
    if (event.key === "Enter") {
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const currentLineText = content.slice(0, start).split("\n").pop() || ""
      const indentMatch = currentLineText.match(/^(\s+)/)
      const indent = indentMatch ? indentMatch[1] : ""

      if (indent.length > 0) {
        event.preventDefault()
        const end = textarea.selectionEnd
        const insertion = "\n" + indent
        const newContent =
          content.slice(0, start) + insertion + content.slice(end)

        updateFileContent(filename, newContent)
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd =
            start + insertion.length
          updateCursor()
        })
      }
    }
  }

  return (
    <div
      className={`editor-pane relative ${
        isFocused ? "editor-pane-focused" : ""
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

      <div
        aria-label={`${filename} code editor`}
        className={`code-editor ${
          minimapSide === "left" ? "minimap-side-left" : ""
        }`}
        data-accessibility-page-size={accessibilityPageSize}
        data-cursor-blinking={cursorBlinking}
        data-render-whitespace={renderWhitespace}
        data-word-wrap={wordWrap}
        role="region"
        style={
          {
            "--editor-tab-size": currentTabSize,
            "--editor-wrap-column": wordWrapColumn,
          } as any
        }
      >
        <div className="code-editor-layout">
          {/* Gutter with line numbers and diagnostic dots */}
          <div className="gutter-column" ref={gutterRef}>
            {lines.map((_, index) => {
              const lineNum = index + 1
              const diag = getLineDiagnostic(lineNum)
              const fileBreakpoints = breakpoints?.[filename] || []
              const hasBreakpoint = fileBreakpoints.includes(lineNum)
              const isStoppedHere =
                activeDebugLine?.file === filename &&
                activeDebugLine.line === lineNum

              return (
                <div
                  className={`line-number ${
                    isFocused && cursorPosition.line === lineNum
                      ? "current-line-num"
                      : ""
                  }`}
                  key={index}
                  onClick={() => toggleBreakpoint(filename, lineNum)}
                  title={`Line ${lineNum} (Click to toggle breakpoint)`}
                >
                  {isStoppedHere ? (
                    <span
                      className="debug-arrow-glyph"
                      title="Paused at breakpoint"
                    />
                  ) : hasBreakpoint ? (
                    <span
                      className="breakpoint-dot"
                      title={`Breakpoint on line ${lineNum}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleBreakpoint(filename, lineNum)
                      }}
                    />
                  ) : (
                    <span className="breakpoint-ghost" />
                  )}

                  {diag && (
                    <span
                      className={`diagnostic-dot ${
                        diag.type === "error"
                          ? "diagnostic-error"
                          : "diagnostic-warning"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        setHoverDiag({
                          diag,
                          x: rect.right + 10,
                          y: rect.top - 6,
                        })
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setHoverDiag({
                          diag,
                          x: rect.right + 10,
                          y: rect.top - 6,
                        })
                      }}
                      title={diag.title}
                    />
                  )}
                  {lineNum}
                </div>
              )
            })}
          </div>

          {/* Interactive buffer view */}
          <div className="editor-buffer-container">
            {/* Syntax layer rendered behind */}
            <div className="syntax-layer" ref={syntaxRef}>
              {lines.map((lineText, index) => {
                const lineNum = index + 1
                const isCurrent = isFocused && cursorPosition.line === lineNum
                const isStoppedHere =
                  activeDebugLine?.file === filename &&
                  activeDebugLine.line === lineNum
                const diag = getLineDiagnostic(lineNum)

                return (
                  <div
                    className={`code-line-layer ${
                      isStoppedHere
                        ? "debug-stopped-line"
                        : isCurrent
                          ? "current-line"
                          : ""
                    }`}
                    key={index}
                  >
                    <code
                      className={
                        diag
                          ? diag.type === "error"
                            ? "error-underline"
                            : "warning-underline"
                          : ""
                      }
                    >
                      {tokenizeLine(lineText, todoOptions)}
                    </code>
                  </div>
                )
              })}
            </div>

            {/* Transparent interactive textarea overlay */}
            <textarea
              aria-label={`Code content for ${filename}`}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="code-textarea"
              onChange={handleChange}
              onClick={updateCursor}
              onFocus={() => {
                setFocusedPane(paneId)
                updateCursor()
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={updateCursor}
              onMouseUp={updateCursor}
              onMouseMove={handleTextareaMouseMove}
              onScroll={syncScroll}
              ref={textareaRef}
              spellCheck={false}
              value={content}
              wrap={
                wordWrap === "on" || wordWrap === "wordWrapColumn"
                  ? "soft"
                  : "off"
              }
            />
          </div>
        </div>

        {minimapEnabled && (
          <Minimap
            clientHeight={scrollInfo.clientHeight}
            editorFontSize={editorFontSize}
            editorLineHeight={editorLineHeight}
            lines={lines}
            onScrollToLine={handleScrollToLine}
            scale={minimapScale}
            scrollHeight={scrollInfo.scrollHeight}
            scrollTop={scrollInfo.scrollTop}
          />
        )}
      </div>

      {hoverDiag && (
        <DiagnosticHoverCard
          diagnostic={hoverDiag.diag}
          onClose={() => setHoverDiag(null)}
          position={{ x: hoverDiag.x, y: hoverDiag.y }}
        />
      )}
    </div>
  )
}

import {
  useRef,
  useState,
  useEffect,
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
    diagnostics,
    setFocusedPane,
    saveFile,
    tabs,
    setSecondaryActiveTab,
    minimapEnabled,
    minimapScale,
    openFind,
    focusedGroup,
    tabSize,
  } = useWorkbench()

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
    const lineNum = Math.floor(relativeY / 21) + 1

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
    const lineHeight = 21
    const targetScroll = Math.max(0, lineIndex * lineHeight - 60)
    textareaRef.current.scrollTop = targetScroll
    if (syntaxRef.current) syntaxRef.current.scrollTop = targetScroll
    if (gutterRef.current) gutterRef.current.scrollTop = targetScroll
    setScrollInfo({
      scrollTop: targetScroll,
      scrollHeight: textareaRef.current.scrollHeight,
      clientHeight: textareaRef.current.clientHeight,
    })
  }

  function updateCursor() {
    if (!textareaRef.current) return
    const pos = textareaRef.current.selectionStart
    const textUpToCursor = textareaRef.current.value.slice(0, pos)
    const currentLines = textUpToCursor.split("\n")
    const line = currentLines.length
    const col = currentLines[currentLines.length - 1].length + 1
    setCursorPosition({ line, col })
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

    // Tab key: Insert spaces matching tabSize
    if (event.key === "Tab") {
      event.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const spaces = " ".repeat(tabSize || 2)
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent = content.slice(0, start) + spaces + content.slice(end)

      updateFileContent(filename, newContent)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length
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

      <div
        aria-label={`${filename} code editor`}
        className="code-editor"
        role="region"
      >
        <div className="code-editor-layout">
          {/* Gutter with line numbers and diagnostic dots */}
          <div className="gutter-column" ref={gutterRef}>
            {lines.map((_, index) => {
              const lineNum = index + 1
              const diag = getLineDiagnostic(lineNum)
              return (
                <div
                  className={`line-number ${
                    isFocused && cursorPosition.line === lineNum
                      ? "current-line-num"
                      : ""
                  }`}
                  key={index}
                >
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
                const diag = getLineDiagnostic(lineNum)

                return (
                  <div
                    className={`code-line-layer ${
                      isCurrent ? "current-line" : ""
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
                      {tokenizeLine(lineText)}
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
              onMouseMove={handleTextareaMouseMove}
              onScroll={syncScroll}
              ref={textareaRef}
              spellCheck={false}
              value={content}
              wrap="off"
            />
          </div>
        </div>

        {minimapEnabled && (
          <Minimap
            clientHeight={scrollInfo.clientHeight}
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
